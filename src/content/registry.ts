export type ContentId = 'world' | 'services' | 'about' | 'contact' | 'fightclub' | 'frequency' | 'labs';
export type ContentEntry = {
  id: ContentId; title: string; eyebrow: string; summary: string; paragraphs: string[];
  status: string; href: string; linkLabel: string;
};

export const CONTENT: Record<ContentId, ContentEntry> = {
  world: {
    id: 'world', title: 'A portfolio you can walk through.', eyebrow: 'Project 01 / WestCose World',
    summary: 'A small world for the things WestCose makes. Find a place, follow your curiosity, see what’s inside.',
    paragraphs: ['WestCose World is a playable 3D portfolio environment. Projects and services become places on a small fictional planet, and an arcade is the future connection to games such as FightClub.', 'Explore a compact California-inspired coastal town: turn into the courtyard, find the service alleys, walk through the studios, or follow the beach promenade to the pier. Coastal groves and headland trails continue around the planet beyond the town.', 'This playable uses an authored town layout, a reusable architectural kit, and a walking character. The world itself is the first project on display. More project exhibits will be connected when portfolio content is supplied.'],
    status: 'In development', href: '/projects/westcose-world', linkLabel: 'View project',
  },
  services: {
    id: 'services', title: 'Room for the next idea.', eyebrow: 'The Workshop / Services',
    summary: 'The workshop is the future home of WestCose services.',
    paragraphs: ['This space is reserved for the real service offering, process, and ways to work together. Those details haven’t been added to this new repository yet.', 'Direct pages also make the work accessible outside the 3D world. Exploring is always optional.'],
    status: 'Content coming soon', href: '/services', linkLabel: 'View services',
  },
  about: {
    id: 'about', title: 'Welcome to WestCose.', eyebrow: 'Inside the Studio / About',
    summary: 'An independent world for projects, experiments, games, and whatever comes next.',
    paragraphs: ['The idea is simple: make discovering the work feel like discovering a place. Walk around, look inside, and take the scenic route if you want.', 'The personal story, studio details, and links will live here once they’re supplied. For now, this is a first look at the world taking shape.'],
    status: 'First playable', href: '/about', linkLabel: 'About WestCose',
  },
  contact: {
    id: 'contact', title: 'The line isn’t connected yet.', eyebrow: 'Contact Station / Contact',
    summary: 'This will be the direct line to WestCose.',
    paragraphs: ['A verified email address or contact destination hasn’t been supplied for this repository. There’s no active submission form in this prototype.', 'When the contact details are added, they’ll be available here and at the contact station in the world.'],
    status: 'Contact details pending', href: '/contact', linkLabel: 'View contact',
  },
  fightclub: {
    id: 'fightclub', title: 'FightClub', eyebrow: 'The Arcade / Game 01',
    summary: 'The first cabinet has a name. Its game connection is still to come.',
    paragraphs: ['FightClub is planned as a game you can launch from inside WestCose World.', 'A working game build or verified launch URL is not included in this repository. The cabinet is a launcher scaffold; there is no playable FightClub game connected yet.'],
    status: 'Not connected', href: '/games/fightclub', linkLabel: 'View game status',
  },
  labs: {
    id: 'labs', title: 'Still figuring it out.', eyebrow: 'Unit 09 / WestCose Labs',
    summary: 'An old workshop for new experiments. Some ideas need a little room.',
    paragraphs: ['This converted workshop is the home for future WebGL studies, prototypes, and unfinished WestCose ideas.', 'The room is explorable now. Individual experiments will be connected here when their real content and destinations are available.'],
    status: 'Experiments coming soon', href: '/labs', linkLabel: 'Visit Labs',
  },
  frequency: {
    id: 'frequency', title: 'You found the quiet side.', eyebrow: 'Coastal Frequency / Field note 01',
    summary: 'Some things are here simply because you took the long way around.',
    paragraphs: ['This small field note is the first optional discovery in WestCose World. Future corners can hold sketches, experiments, or things that never became finished projects.', 'Discovery is saved on this device. Nothing in the portfolio depends on collecting it.'],
    status: 'Optional discovery', href: '/about', linkLabel: 'About the world',
  },
};

export const DESTINATIONS = [
  { label: 'Projects', place: 'Project Studio', id: 'world', href: '/projects', number: '01' },
  { label: 'Services', place: 'The Workshop', id: 'services', href: '/services', number: '02' },
  { label: 'Games', place: 'The Arcade', id: 'fightclub', href: '/games', number: '03' },
  { label: 'About', place: 'Inside the Studio', id: 'about', href: '/about', number: '01b' },
  { label: 'Contact', place: 'Contact Station', id: 'contact', href: '/contact', number: '04' },
] as const;

// Replace this unavailable entry only after verifying the actual game destination.
export const GAMES = [{ id: 'fightclub', kind: 'unavailable', title: 'FightClub' }] as const;
