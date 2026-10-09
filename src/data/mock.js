export const HOURLY_CURVE = [
  0.18, 0.24, 0.32, 0.44, 0.58, 0.74, 0.88, 0.94, 0.82, 0.62, 0.44, 0.30
];

export const MOCK_ROOMS = [
  { id: 301, exposure: 0.95, baseTaps: 14, description: "West-facing · top floor" },
  { id: 302, exposure: 0.90, baseTaps: 11, description: "West-facing · top floor" },
  { id: 303, exposure: 0.70, baseTaps: 7,  description: "Top floor" },
  { id: 304, exposure: 0.65, baseTaps: 5,  description: "Top floor" },
  { id: 305, exposure: 0.40, baseTaps: 2,  description: "Top floor · east side" },
  { id: 306, exposure: 0.35, baseTaps: 1,  description: "Top floor · east side" },
  { id: 311, exposure: 0.60, baseTaps: 4,  description: "Corner · west side" },
  { id: 312, exposure: 0.35, baseTaps: 1,  description: "Mid block" },
  { id: 313, exposure: 0.30, baseTaps: 0,  description: "Mid block" },
  { id: 314, exposure: 0.30, baseTaps: 1,  description: "Mid block" },
  { id: 315, exposure: 0.35, baseTaps: 1,  description: "Mid block" },
  { id: 316, exposure: 0.60, baseTaps: 4,  description: "Corner · east side" }
];

export const FIXES = [
  {
    id: "shade",
    title: "Shade west windows",
    roomsNote: "Rooms 301, 302, 311",
    targetRooms: [301, 302, 311],
    reduction: 0.30
  },
  {
    id: "vents",
    title: "Open corridor vents",
    roomsNote: "Rooms 301–306",
    targetRooms: [301, 302, 303, 304, 305, 306],
    reduction: 0.15
  },
  {
    id: "fans",
    title: "Run fans early",
    roomsNote: "All rooms",
    targetRooms: [301, 302, 303, 304, 305, 306, 311, 312, 313, 314, 315, 316],
    reduction: 0.10
  }
];
