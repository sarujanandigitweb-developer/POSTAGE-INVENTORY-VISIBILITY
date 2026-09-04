// The family -> badge-colour map, lifted verbatim from the published dashboard's
// TYPE_CLASS so a SKU carries the SAME colour on both pages. It alternates two tones
// down each section's family list; the colours mean "a different family", not a rank.
//
// `CG` was listed twice there with the same value — an object literal keeps the last,
// so the duplicate never did anything. It appears once here.
//
// A family with no entry falls back to 'crff', exactly as the dashboard does: the map
// covers the families the curated sections declare, and Wall Arm's WAAD/WAAR/WADB/WAOT
// are outside it, so the whole section reads in one tone rather than a random split.
const TYPE_CLASS = {
  CRSF:'crsf', CRFF:'crff', CROT:'crff', MT:'crsf', GL:'crff', FB:'crsf', CG:'crff',
  NR:'crsf', PD:'crsf', CP:'crff', WA:'crsf', AW:'crff', WB:'crsf', GN:'crff', CR:'crsf',
  PL:'crff', DA:'crsf', DS:'crff', BN:'crsf', BI:'crff', AC:'crsf', WWCW:'crsf',
  FDE:'crff', A60:'crsf', DCO:'crff', ST64:'crsf', SMS:'crff', GLO:'crsf', EXO:'crff',
  PIN:'crsf', SPF:'crff', PC:'crsf', TR:'crff', CL:'crsf', SP:'crff', SW:'crsf', CB:'crff',
  RW:'crsf', CO:'crff', SO:'crsf', NF:'crsf', ST:'crff', WJ:'crsf', TS:'crff', HK:'crsf',
  CN:'crff', IM:'crsf', SCRN:'crff', CEN:'crsf', LC:'crff', SDP:'crsf', RD:'crff',
  BC:'crsf', SLW:'crff', HR:'crsf', RPM:'crff', CM:'crsf', NT:'crff', WR:'crsf',
  XWC:'crsf', XCH:'crff', XBL:'crff', GPS:'crsf', GPL:'crff', GWL:'crsf', GWS:'crff',
  GTP:'crsf',
};

export function typeClass(family) {
  return TYPE_CLASS[family] || 'crff';
}
