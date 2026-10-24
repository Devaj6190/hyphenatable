// Fake display names and labels for synthetic companies. Invented combinations only;
// never add a real person's name, a real customer, or a real address here.

export const STREETS = [
  "Larkspur Ln",
  "Birchwood Ave",
  "Juniper Way",
  "Foxglove Ct",
  "Alder Run",
  "Quail Hollow Rd",
  "Sorrel St",
  "Hawthorn Pl",
  "Bramble Dr",
  "Willow Bend",
  "Sage Hill Rd",
  "Cobble Creek Ln",
  "Marigold Ter",
  "Elderberry Ct",
  "Tansy Loop",
  "Yarrow Ave",
  "Heron Point Dr",
  "Clover Ridge",
  "Thistle Ln",
  "Aspen Fork Rd",
  "Pinecone Path",
  "Laurel Glen",
  "Fennel St",
  "Mossbank Way",
];

// Kinds of landscaping work for past-cycle jobs. `lighting` jobs are the ones quoted in person.
export const WORK = [
  { title: "Front yard sod install", kind: "install" },
  { title: "Backyard patio and drainage", kind: "hardscape" },
  { title: "Hedge trim and cleanup", kind: "maintenance" },
  { title: "Retaining wall rebuild", kind: "hardscape" },
  { title: "Irrigation system install", kind: "install" },
  { title: "Seasonal mulch refresh", kind: "maintenance" },
  { title: "Paver walkway", kind: "hardscape" },
  { title: "Tree and shrub planting", kind: "install" },
  { title: "Drip line repair", kind: "maintenance" },
  { title: "Gravel side yard", kind: "hardscape" },
  { title: "Lawn renovation", kind: "install" },
  { title: "Landscape lighting install", kind: "lighting" },
] as const;

export const VENDORS = {
  Materials: [
    "Valley Turf Farm",
    "Cedar Creek Supply",
    "Stonebridge Landscape Supply",
    "Greenway Nursery",
  ],
  "Equipment Rental": ["Ridgeway Equipment Rental", "Summit Tool Rental"],
  Disposal: ["County Green Waste", "Eastside Transfer Station"],
  Fuel: ["Corner Fuel Stop", "Highway 9 Fuel"],
  Software: ["FieldRoute Software"],
  Insurance: ["Harborline Insurance"],
} as const;

export const JOBBER_EXPENSE_TITLES = [
  "Sod staples",
  "Landscape fabric",
  "Drip emitters",
  "Hedge trimmer blades",
  "Edging stakes",
  "Fasteners",
];

// ---- Company B (HVAC). Distinct from Company A's streets and work.

export const B_STREETS = [
  "Granite Pass",
  "Redwood Terrace",
  "Kestrel Court",
  "Mesa Verde Dr",
  "Osprey Lane",
  "Driftwood Ave",
  "Canyon Wren Rd",
  "Ironbark St",
  "Sandpiper Way",
  "Bluebell Ct",
  "Larch Hollow",
  "Saltgrass Rd",
  "Copperleaf Dr",
  "Wintergreen Pl",
  "Tamarack Ave",
  "Juniper Ridge Rd",
  "Falcon Crest",
  "Seabright Ln",
  "Chaparral Way",
  "Morningside Ct",
  "Silverado Trl",
  "Cypress Bend",
  "Harrow Ln",
  "Lupine Loop",
  "Boulder Creek Rd",
  "Starling St",
  "Oakmont Ter",
  "Pebble Beach Ct",
  "Wildrye Ave",
  "Coyote Run",
];

export const B_INSTALL_WORK = [
  "Heat pump install",
  "Furnace and AC replacement",
  "Ductless mini-split install",
  "Rooftop unit swap",
  "Ductwork replacement",
  "Air handler replacement",
];

export const B_SERVICE_WORK = [
  "AC repair",
  "Furnace tune-up",
  "Maintenance agreement visit",
  "Thermostat replacement",
  "Refrigerant leak repair",
  "No-heat call",
  "Condenser fan motor repair",
];
