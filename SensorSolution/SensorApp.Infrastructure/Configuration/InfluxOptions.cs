namespace SensorApp.Infrastructure.Configuration;

public class InfluxOptions
{
  public string Url { get; set; } = string.Empty;
  public string Org { get; set; } = string.Empty;
  public string Bucket { get; set; } = string.Empty;
  public string Token { get; set; } = string.Empty;
}