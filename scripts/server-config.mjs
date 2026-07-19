// Static display metadata for each Beszel system.
// Find a system's ID:
//   sqlite3 /opt/beszel/beszel_data/data.db "SELECT id,name,host FROM systems;"
export const BESZEL_SERVER_CONFIG = {
  aoc1me18y6zc5ma: {
    displayName: "Alibaba Cloud",
    location: "Chengdu",
    region: "Southwest China",
    flag: "🇨🇳",
    lat: 30.5728,
    lon: 104.0668,
    provider: "Alibaba Cloud",
    os: "Alibaba Cloud Linux 3",
  },
  "1r8ne4rjytgkc27": {
    displayName: "Azure Hong Kong",
    location: "Hong Kong",
    region: "East Asia",
    flag: "🇭🇰",
    lat: 22.3193,
    lon: 114.1694,
    provider: "Microsoft Azure",
    os: "Ubuntu 22.04",
  },
  sl7nevxf8gjiu2: {
    displayName: "Azure US West",
    location: "Washington",
    region: "North America",
    // Use an explicit ISO country code so the UI never has to infer it from
    // an emoji when coloring the world map.
    flag: "US",
    lat: 47.6062,
    lon: -122.3321,
    provider: "Microsoft Azure",
    os: "Ubuntu 22.04",
  },
};
