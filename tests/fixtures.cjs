const NOW = Date.parse("2026-11-17T06:00:00Z");
const weather = {
  current: {
    temperature_2m: 37.5,
    apparent_temperature: 31.2,
    weather_code: 2,
    is_day: 0,
    time: NOW / 1000
  },
  daily: { temperature_2m_max: [46], temperature_2m_min: [29] }
};
function event(id, hours, state = "pre", team = "17", extra = {}) {
  return {
    id,
    date: new Date(NOW + hours * 3600000).toISOString(),
    timeValid: true,
    competitions: [
      {
        competitors: [
          {
            homeAway: "home",
            team: {
              id: team,
              abbreviation: team === "17" ? "NE" : "BOS",
              shortDisplayName: "Our team"
            },
            score: { displayValue: "24" }
          },
          {
            homeAway: "away",
            team: {
              id: "999",
              abbreviation: "OPP",
              shortDisplayName: "Opponent"
            },
            score: { displayValue: "17" }
          }
        ],
        status: {
          type: {
            state,
            completed: state === "post",
            description: state === "post" ? "Final" : "Scheduled",
            shortDetail:
              state === "in"
                ? "Q3 5:00"
                : state === "post"
                  ? "Final"
                  : "Scheduled"
          }
        },
        venue: { fullName: "Home stadium" },
        broadcasts: [{ media: { shortName: "NBC" } }],
        ...extra
      }
    ]
  };
}
const schedule = {
  events: [event("last", -20, "post"), event("next", 48), event("later", 120)]
};
module.exports = { NOW, weather, event, schedule };
