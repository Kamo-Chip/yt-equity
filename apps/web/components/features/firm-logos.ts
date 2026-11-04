const firmLogos: Record<string, string> = {
  "Electrify Video Partners": "/firm-logos/electrify.svg",
  Spotter: "/firm-logos/spotter.jpg",
  "Lunar X": "/firm-logos/lunar-x.png",
  "Little Dot Studios": "/firm-logos/little-dot.png",
  "Recurrent Ventures": "/firm-logos/recurrent.svg",
  "Electric Monster": "/firm-logos/electric-monster.svg"
};

export function firmLogo(name: string) { return firmLogos[name]; }
