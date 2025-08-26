using SensorApp.Components;
using SensorApp.Infrastructure.Data;
using SensorApp.Infrastructure.Repositories;
using SensorApp.Infrastructure.Configuration;
using SensorApp.Core.Interfaces;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

builder.Services.AddServerSideBlazor()
    .AddCircuitOptions(o => o.DetailedErrors = true);


// Influx options
var influxSection = builder.Configuration.GetSection("Influx");
var influxOptions = influxSection.Get<InfluxOptions>() ?? new InfluxOptions();
builder.Services.AddSingleton(influxOptions);

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
