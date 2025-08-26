using System.IO; 
using SensorApp.Components;
using SensorApp.Infrastructure.Data;
using SensorApp.Infrastructure.Configuration;
using SensorApp.Core.Models;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

builder.Services.AddServerSideBlazor()
    .AddCircuitOptions(o => o.DetailedErrors = true);

// Removed EF/SQLite context; using InfluxDB only

// Influx options
var influxSection = builder.Configuration.GetSection("Influx");
var influxOptions = influxSection.Get<InfluxOptions>() ?? new InfluxOptions();
builder.Services.AddSingleton(influxOptions);

// Repository DI (swap to Influx):
// builder.Services.AddScoped<ISensorRepository, EfSensorRepository>();
builder.Services.AddScoped<ISensorRepository, InfluxSensorRepository>();
builder.Services.AddScoped<ISessionService, SessionService>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseAntiforgery();
app.MapStaticAssets();

app.MapRazorComponents<App>()
   .AddInteractiveServerRenderMode();

app.Run();
