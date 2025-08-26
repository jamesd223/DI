using InfluxDB.Client;
using InfluxDB.Client.Api.Domain;
using InfluxDB.Client.Writes;
using SensorApp.Core.Models;

namespace SensorApp.Infrastructure.Data;

// Hybrid repository: readings -> Influx; sessions -> SQLite
public class InfluxSensorRepository : ISensorRepository
{
  private readonly InfluxDBClient _client;
  private readonly string _org;
  private readonly string _bucket;

  public InfluxSensorRepository(InfluxOptions options)
  {
    _org = options.Org;
    _bucket = options.Bucket;
    _client = new InfluxDBClient(options.Url, options.Token);
  }

  public async Task AddReadingAsync(DateTime timestampUtc, double value, int? sessionId, double? distanceIn = null, CancellationToken ct = default)
  {
    var write = _client.GetWriteApiAsync();
    var p = PointData
      .Measurement("reading")
      .Tag("sid", sessionId?.ToString() ?? "none")
      .Field("value", value)
      .Field("distance_in", distanceIn ?? double.NaN)
      .Timestamp(timestampUtc, WritePrecision.Ns);
    await write.WritePointAsync(p, _bucket, _org, ct);
  }

  public async Task<int> StartSessionAsync(string? name, DateTime startedAtUtc, CancellationToken ct = default)
  {
    // get next session id from max sid field
    var q = _client.GetQueryApi();
    var flux = $"from(bucket: \"{_bucket}\") |> range(start: 0) |> filter(fn: (r) => r._measurement == \"session\" and r._field == \"sid\") |> max()";
    var tables = await q.QueryAsync(flux, _org, ct);
    var maxSid = 0;
    foreach (var table in tables)
      foreach (var rec in table.Records)
        if (rec.GetValue() != null)
          maxSid = Math.Max(maxSid, Convert.ToInt32(Convert.ToDouble(rec.GetValue())));
    var nextSid = maxSid + 1;

    var write = _client.GetWriteApiAsync();
    var p = PointData
      .Measurement("session")
      .Tag("event", "start")
      .Tag("sid", nextSid.ToString())
      .Field("sid", nextSid)
      .Field("name", string.IsNullOrWhiteSpace(name) ? "" : name)
      .Timestamp(startedAtUtc, WritePrecision.Ns);
    await write.WritePointAsync(p, _bucket, _org, ct);
    return nextSid;
  }

  public async Task EndSessionAsync(int sessionId, DateTime endedAtUtc, CancellationToken ct = default)
  {
    var write = _client.GetWriteApiAsync();
    var p = PointData
      .Measurement("session")
      .Tag("event", "end")
      .Tag("sid", sessionId.ToString())
      .Field("sid", sessionId)
      .Timestamp(endedAtUtc, WritePrecision.Ns);
    await write.WritePointAsync(p, _bucket, _org, ct);
  }

  public async Task<IReadOnlyList<Session>> GetSessionsAsync(CancellationToken ct = default)
  {
    var q = _client.GetQueryApi();
    // start records carry name and sid tag
    var fluxStarts = $"from(bucket: \"{_bucket}\") |> range(start: 0) |> filter(fn: (r) => r._measurement == \"session\" and r.event == \"start\" and r._field == \"name\") |> sort(columns: [\"_time\"], desc: true)";
    var startTables = await q.QueryAsync(fluxStarts, _org, ct);
    var startBySid = new Dictionary<int, (DateTime time, string name)>();
    foreach (var table in startTables)
    {
      foreach (var rec in table.Records)
      {
        var sidStr = rec.GetValueByKey("sid")?.ToString();
        if (!int.TryParse(sidStr, out var sid)) continue;
        if (!startBySid.ContainsKey(sid))
        {
          var t = rec.GetTimeInDateTime().GetValueOrDefault().ToUniversalTime();
          var name = rec.GetValue()?.ToString() ?? string.Empty;
          startBySid[sid] = (t, name);
        }
      }
    }

    // end records: take latest end per sid
    var fluxEnds = $"from(bucket: \"{_bucket}\") |> range(start: 0) |> filter(fn: (r) => r._measurement == \"session\" and r.event == \"end\" and r._field == \"sid\")";
    var endTables = await q.QueryAsync(fluxEnds, _org, ct);
    var endBySid = new Dictionary<int, DateTime>();
    foreach (var table in endTables)
    {
      foreach (var rec in table.Records)
      {
        var sidStr = rec.GetValueByKey("sid")?.ToString();
        if (!int.TryParse(sidStr, out var sid)) continue;
        var t = rec.GetTimeInDateTime().GetValueOrDefault().ToUniversalTime();
        if (!endBySid.TryGetValue(sid, out var prev) || t > prev)
          endBySid[sid] = t;
      }
    }

    var sessions = startBySid
      .Select(kv => new Session { Id = kv.Key, Name = string.IsNullOrWhiteSpace(kv.Value.name) ? null : kv.Value.name, StartedAt = kv.Value.time, EndedAt = endBySid.TryGetValue(kv.Key, out var et) ? et : null })
      .OrderByDescending(s => s.StartedAt)
      .ToList();
    return sessions;
  }

  public async Task<IReadOnlyList<SensorReading>> GetReadingsBySessionAsync(int sessionId, CancellationToken ct = default)
  {
    var query = _client.GetQueryApi();
    // Prefer distance_in if present; otherwise, fall back to value (normalized)
    var fluxDist = $"from(bucket: \"{_bucket}\") |> range(start: 0) |> filter(fn: (r) => r._measurement == \"reading\" and r.sid == \"{sessionId}\" and r._field == \"distance_in\") |> sort(columns: [\"_time\"])";
    var distTables = await query.QueryAsync(fluxDist, _org, ct);
    IEnumerable<SensorReading> ParseTables(IList<InfluxDB.Client.Core.Flux.Domain.FluxTable> tbs)
    {
      var acc = new List<SensorReading>();
      foreach (var table in tbs)
      {
        foreach (var record in table.Records)
        {
          if (record.GetValue() is double dv)
          {
            acc.Add(new SensorReading
            {
              Timestamp = record.GetTimeInDateTime().GetValueOrDefault().ToUniversalTime(),
              Value = dv,
              SessionId = sessionId
            });
          }
        }
      }
      return acc;
    }

    var distList = ParseTables(distTables).ToList();
    if (distList.Count > 0) return distList;

    var fluxVal = $"from(bucket: \"{_bucket}\") |> range(start: 0) |> filter(fn: (r) => r._measurement == \"reading\" and r.sid == \"{sessionId}\" and r._field == \"value\") |> sort(columns: [\"_time\"])";
    var valTables = await query.QueryAsync(fluxVal, _org, ct);
    return ParseTables(valTables).ToList();
  }

  public async Task<IReadOnlyList<SensorReading>> GetRecentReadingsAsync(int take, CancellationToken ct = default)
  {
    var query = _client.GetQueryApi();
    var flux = $"from(bucket: \"{_bucket}\") |> range(start: -7d) |> filter(fn: (r) => r._measurement == \"reading\" and r._field == \"value\") |> sort(columns: [\"_time\"], desc: true) |> limit(n: {take})";
    var tables = await query.QueryAsync(flux, _org, ct);
    var list = new List<SensorReading>();
    foreach (var table in tables)
    {
      foreach (var record in table.Records)
      {
        if (record.GetValue() is double dv)
        {
          list.Add(new SensorReading
          {
            Timestamp = record.GetTimeInDateTime().GetValueOrDefault().ToUniversalTime(),
            Value = dv
          });
        }
      }
    }
    return list;
  }
}


