// Static display metadata for each Beszel system.
// Find a system's ID:
//   sqlite3 /opt/beszel/beszel_data/data.db "SELECT id,name,host FROM systems;"
export const BESZEL_SERVER_CONFIG = {
  "demo-home-lab": {
    displayName: "Home Lab",
    location: "Home",
    region: "Private Network",
    flag: "🏠",
    lat: 37.77,
    lon: -122.42,
    provider: "Local machine",
    os: "Linux",
  },
  "demo-cloud-vps": {
    displayName: "Cloud VPS",
    location: "Cloud Region",
    region: "Demo Region",
    flag: "☁️",
    lat: 40.71,
    lon: -74.01,
    provider: "Example Host",
    os: "Linux",
  },
  "demo-edge-node": {
    displayName: "Edge Node",
    location: "Edge Site",
    region: "Demo Edge",
    flag: "📍",
    lat: 51.51,
    lon: -0.13,
    provider: "Example Edge",
    os: "Linux",
  },
};
