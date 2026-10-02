export type ContentId = 'world' | 'services' | 'shop' | 'about' | 'contact' | 'fightclub' | 'frequency' | 'labs' | 'snowboard' | 'skateshop' | 'skatepark' | 'fishing';
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
    id: 'services', title: 'Room for the next idea.', eyebrow: 'WestCose Studio / Services',
    summary: 'The studio office upstairs at Palm Court is the future home of WestCose services.',
    paragraphs: ['This space is reserved for the real service offering, process, and ways to work together. Those details haven’t been added to this new repository yet.', 'Direct pages also make the work accessible outside the 3D world. Exploring is always optional.'],
    status: 'Content coming soon', href: '/services', linkLabel: 'View services',
  },
  shop: {
    id: 'shop', title: 'Wear the coast.', eyebrow: 'WestCose Shop / Clothing',
    summary: 'Tees, hoodies and caps from the coast. The racks are stocked; online orders are coming soon.',
    paragraphs: ['The WestCose Shop on the courtyard is the home of WestCose clothing: tees, hoodies, caps and whatever the next drop brings.', 'An online store hasn’t been connected to this repository yet. When it is, ordering will open from here.'],
    status: 'Online store coming soon', href: '', linkLabel: '',
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
  snowboard: {
    id: 'snowboard', title: 'Four runs from the summit.', eyebrow: 'Ski Resort / Snowboard',
    summary: 'Find the lift-ticket booth at the ski resort, at the top of the forest trail north of town. Pick a run, ride from the summit, and chain tricks for points.',
    paragraphs: ['Four rated runs leave the summit plateau: a green circle back to the resort, a blue square to the bluff above the lighthouse cove, a black diamond into the west forest, and a double black straight down the couloir.', 'Carve, jump the kickers, collect tokens and land tricks to build combos. Medals, best scores and challenge stars are saved on this device.'],
    status: 'Playable mini-game', href: '', linkLabel: '',
  },
  skateshop: {
    id: 'skateshop', title: 'Grab a board.', eyebrow: 'WestCose Skate Shop / Skateboards',
    summary: 'The decks hang on the wall behind the counter on Main Street. Take one, head outside and ride anywhere in town.',
    paragraphs: ['Walk up to the counter and take a skateboard. Equip it from the button on screen whenever you are outdoors, and put it away again the same way.', 'Push, carve, ollie, flip, grab and grind in the style of the classic arcade skate games. The skate park on the west bluff is where it all comes together.'],
    status: 'Free to ride', href: '', linkLabel: '',
  },
  skatepark: {
    id: 'skatepark', title: 'Game of S.K.A.T.E.', eyebrow: 'WestCose Skate Park / Mini-game',
    summary: 'Climb the grand stairs at the west end of Main Street. Collect the letters S, K, A, T and E around the park before the clock runs out.',
    paragraphs: ['Each letter asks for a different skill: an ollie, big vert air in the Deep End, a ledge grind, the full Snake Run and an air out of the South Quarter.', 'You need a skateboard from the WestCose Skate Shop to play. Best times and scores are saved on this device.'],
    status: 'Playable mini-game', href: '', linkLabel: '',
  },
  fishing: {
    id: 'fishing', title: 'Pier Pressure.', eyebrow: 'Westcose Pier / Fishing',
    summary: 'Walk to the rail at the end of the pier and cast. Every fish you land can be kept, or hooked back on as bait for something bigger.',
    paragraphs: ['The food chain runs from sardines to sharks, whales and things that should not be in a fishing game. Each step up pays about three times more, and fights harder.', 'Let go of the reel when a fish runs, steer against its bolts, and bow when it jumps. Clams buy better tackle. Records, the Fish-o-dex and clams are saved on this device.'],
    status: 'Playable mini-game', href: '', linkLabel: '',
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
  { label: 'Services', place: 'WestCose Studio', id: 'services', href: '/services', number: '02' },
  { label: 'Games', place: 'The Arcade', id: 'fightclub', href: '/games', number: '03' },
  { label: 'About', place: 'Inside the Studio', id: 'about', href: '/about', number: '01b' },
  { label: 'Contact', place: 'Contact Station', id: 'contact', href: '/contact', number: '04' },
] as const;

// Replace this unavailable entry only after verifying the actual game destination.
export const GAMES = [{ id: 'fightclub', kind: 'unavailable', title: 'FightClub' }] as const;
