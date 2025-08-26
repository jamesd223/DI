namespace SensorApp.Core.Models;

public class Session
{
  public int Id { get; set; }
  public string? Name { get; set; }
  public DateTime StartedAt { get; set; }
  public DateTime? EndedAt { get; set; }

  public ICollection<SensorReading> Readings { get; set; } = new List<SensorReading>();
}


