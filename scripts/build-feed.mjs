// News Ramen feed builder.
// Pulls stories from a fixed list of trusted outlets, drops junk, groups the
// same story from different outlets into one "full coverage" cluster, and
// writes data/feed.json. Also builds data/events.json for the Up Next tab.
// Runs in GitHub Actions every 30 minutes; no npm dependencies (Node 20+).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const UA = 'Mozilla/5.0 (compatible; NewsRamen/1.0; personal feed reader)';
const NOW = Date.now();
const HOUR = 3600e3;

// ---------------------------------------------------------------- sources
// tier: A = public broadcaster / wire / agency, B = established outlet,
//       S = specialist outlet for its topic.
const FEEDS = [
  { id: 'rnz-nz', name: 'RNZ', url: 'https://www.rnz.co.nz/rss/national.xml', topic: 'nz', tier: 'A' },
  { id: 'rnz-pol', name: 'RNZ', url: 'https://www.rnz.co.nz/rss/political.xml', topic: 'nz', tier: 'A' },
  { id: 'rnz-world', name: 'RNZ', url: 'https://www.rnz.co.nz/rss/world.xml', topic: 'world', tier: 'A' },
  { id: 'rnz-sport', name: 'RNZ', url: 'https://www.rnz.co.nz/rss/sport.xml', topic: 'sport', tier: 'A' },
  { id: 'rnz-biz', name: 'RNZ', url: 'https://www.rnz.co.nz/rss/business.xml', topic: 'business', tier: 'A' },
  { id: 'rnz-tech', name: 'RNZ', url: 'https://www.rnz.co.nz/rss/media-technology.xml', topic: 'tech', tier: 'A' },
  { id: '1news', name: '1News', url: 'https://www.1news.co.nz/arc/outboundfeeds/rss/?outputType=xml', topic: 'nz', tier: 'B' },
  { id: 'herald', name: 'NZ Herald', url: 'https://www.nzherald.co.nz/arc/outboundfeeds/rss/curated/78/?outputType=xml', topic: 'nz', tier: 'B' },
  { id: 'stuff', name: 'Stuff', url: 'https://www.stuff.co.nz/rss', topic: 'nz', tier: 'B' },
  { id: 'bbc-world', name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', topic: 'world', tier: 'A' },
  { id: 'aljazeera', name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', topic: 'world', tier: 'B' },
  { id: 'verge', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', topic: 'tech', tier: 'B' },
  { id: 'ars', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', topic: 'tech', tier: 'B' },
  { id: 'eurogamer', name: 'Eurogamer', url: 'https://www.eurogamer.net/feed', topic: 'gaming', tier: 'S' },
  { id: 'pcgamer', name: 'PC Gamer', url: 'https://www.pcgamer.com/rss/', topic: 'gaming', tier: 'S' },
  { id: 'rps', name: 'Rock Paper Shotgun', url: 'https://www.rockpapershotgun.com/feed', topic: 'gaming', tier: 'S' },
  { id: 'gibiz', name: 'GamesIndustry.biz', url: 'https://www.gamesindustry.biz/feed', topic: 'gaming', tier: 'S' },
  { id: 'nasa', name: 'NASA', url: 'https://www.nasa.gov/feed/', topic: 'science', tier: 'A' },
  { id: 'sciencedaily', name: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/top/science.xml', topic: 'science', tier: 'S' },
  { id: 'phys', name: 'Phys.org', url: 'https://phys.org/rss-feed/', topic: 'science', tier: 'S' },
  { id: 'space', name: 'Space.com', url: 'https://www.space.com/feeds/all', topic: 'science', tier: 'S' },
  { id: 'variety', name: 'Variety', url: 'https://variety.com/feed/', topic: 'entertainment', tier: 'B' },
  { id: 'thr', name: 'The Hollywood Reporter', url: 'https://www.hollywoodreporter.com/feed/', topic: 'entertainment', tier: 'B' },
  { id: 'deadline', name: 'Deadline', url: 'https://deadline.com/feed/', topic: 'entertainment', tier: 'B' },
  { id: 'zerotackle', name: 'Zero Tackle', url: 'https://www.zerotackle.com/feed/', topic: 'league', tier: 'S' },
  // Other points of view: news from across the spectrum and abroad.
  { id: 'newsroom', name: 'Newsroom', url: 'https://newsroom.co.nz/feed/', topic: 'nz', tier: 'B' },
  { id: 'telegraph', name: 'The Telegraph', url: 'https://www.telegraph.co.uk/rss.xml', topic: 'world', tier: 'B', max: 20 },
  { id: 'fox-world', name: 'Fox News', url: 'https://moxie.foxnews.com/google-publisher/world.xml', topic: 'world', tier: 'B' },
  { id: 'wash-exam', name: 'Washington Examiner', url: 'https://www.washingtonexaminer.com/feed/', topic: 'world', tier: 'B' },
  { id: 'intercept', name: 'The Intercept', url: 'https://theintercept.com/feed/?rss', topic: 'world', tier: 'B' },
  { id: 'motherjones', name: 'Mother Jones', url: 'https://www.motherjones.com/feed/', topic: 'world', tier: 'B' },
  { id: 'dw', name: 'DW', url: 'https://rss.dw.com/rdf/rss-en-world', topic: 'world', tier: 'A' },
  { id: 'france24', name: 'France 24', url: 'https://www.france24.com/en/rss', topic: 'world', tier: 'A' },
  { id: 'scmp', name: 'South China Morning Post', url: 'https://www.scmp.com/rss/91/feed', topic: 'world', tier: 'B', max: 20 },
  { id: 'npr', name: 'NPR', url: 'https://feeds.npr.org/1004/rss.xml', topic: 'world', tier: 'A' },
  // Opinion and commentary, kept in their own "Views" section.
  { id: 'platform', name: 'The Platform', url: 'https://theplatform.kiwi/feed', topic: 'views', tier: 'S' },
  { id: 'kiwiblog', name: 'Kiwiblog', url: 'https://www.kiwiblog.co.nz/feed', topic: 'views', tier: 'O' },
  { id: 'pointoforder', name: 'Point of Order', url: 'https://pointofordernz.wordpress.com/feed/', topic: 'views', tier: 'O' },
  { id: 'dailyblog', name: 'The Daily Blog', url: 'https://thedailyblog.co.nz/feed/', topic: 'views', tier: 'O' },
  { id: 'reason', name: 'Reason', url: 'https://reason.com/feed/', topic: 'views', tier: 'S', max: 15 },
  { id: 'freepress', name: 'The Free Press', url: 'https://www.thefp.com/feed', topic: 'views', tier: 'S' },
  { id: 'unherd', name: 'UnHerd', url: 'https://unherd.com/feed/', topic: 'views', tier: 'S', max: 15 },
  { id: 'natreview', name: 'National Review', url: 'https://www.nationalreview.com/feed/', topic: 'views', tier: 'S', max: 15 },
  { id: 'nation', name: 'The Nation', url: 'https://www.thenation.com/feed/?post_type=article', topic: 'views', tier: 'S', max: 15 },
  { id: 'jacobin', name: 'Jacobin', url: 'https://jacobin.com/feed', topic: 'views', tier: 'S', max: 15 },
  { id: 'democracynow', name: 'Democracy Now!', url: 'https://www.democracynow.org/democracynow.rss', topic: 'views', tier: 'S', max: 15 },
  // Mysteries, oddities and the unexplained.
  { id: 'atlas', name: 'Atlas Obscura', url: 'https://www.atlasobscura.com/feeds/latest', topic: 'mystery', tier: 'S', days: 10 },
  { id: 'upi-odd', name: 'UPI Odd News', url: 'https://rss.upi.com/news/odd_news.rss', topic: 'mystery', tier: 'B', days: 7 },
  { id: 'ati', name: "All That's Interesting", url: 'https://allthatsinteresting.com/feed', topic: 'mystery', tier: 'X', days: 7, max: 25 },
  { id: 'skeptic', name: 'Skeptical Inquirer', url: 'https://skepticalinquirer.org/feed/', topic: 'mystery', tier: 'S', days: 45 },
  { id: 'smithsonian', name: 'Smithsonian', url: 'https://www.smithsonianmag.com/rss/latest_articles/', topic: 'science', tier: 'B', days: 7 },
  { id: 'livescience', name: 'Live Science', url: 'https://www.livescience.com/feeds/all', topic: 'science', tier: 'S' },
];

// Rough political lean of each outlet's news/opinion, from public media-bias
// ratings (AllSides / Ad Fontes style). L, CL, C, CR, R. Outlets not listed
// (tech, gaming, science, sport) aren't rated.
const LEAN = {
  'RNZ': 'CL', 'Stuff': 'CL', 'Newsroom': 'CL', 'NZ Herald': 'C', '1News': 'C', 'The Press': 'C', 'The Post': 'C', 'ODT': 'C',
  'The Spinoff': 'L', 'The Daily Blog': 'L', 'Kiwiblog': 'R', 'Point of Order': 'R', 'The Platform': 'R',
  'BBC News': 'C', 'BBC': 'C', 'Reuters': 'C', 'AP': 'CL', 'DW': 'C', 'France 24': 'C', 'South China Morning Post': 'C',
  'NPR': 'CL', 'ABC (AU)': 'CL', 'Al Jazeera': 'CL', 'The Guardian': 'L', 'NY Times': 'CL',
  'The Telegraph': 'CR', 'Fox News': 'R', 'Washington Examiner': 'R', 'National Review': 'R', 'Reason': 'CR', 'The Free Press': 'CR',
  'NewsNation': 'C', 'CBC': 'CL', 'The Independent': 'CL', 'Euronews.com': 'C', 'CBS News': 'CL',
  'UnHerd': 'C', 'The Intercept': 'L', 'Mother Jones': 'L', 'The Nation': 'L', 'Jacobin': 'L', 'Democracy Now!': 'L',
};

// Google News search is used only to *find* stories on niche topics; every
// result must come from a domain on these allow-lists or it is dropped.
const NZ_OUTLETS = ['rnz.co.nz', 'nzherald.co.nz', 'stuff.co.nz', 'thepress.co.nz', 'thepost.co.nz', 'odt.co.nz',
  '1news.co.nz', 'newsroom.co.nz', 'thespinoff.co.nz', 'interest.co.nz', 'sportnation.nz', 'nzsportswire.com', 'ccc.govt.nz'];
const GLOBAL_OUTLETS = ['bbc.co.uk', 'bbc.com', 'reuters.com', 'apnews.com', 'abc.net.au', 'theguardian.com',
  'nytimes.com', 'espn.com', 'olympics.com', 'cbssports.com', 'skysports.com'];
const SPORT_OUTLETS = ['nrl.com', 'warriors.kiwi', 'nzrl.co.nz', 'zerotackle.com', 'foxsports.com.au', 'sportingnews.com',
  'fiba.basketball', 'nz.basketball', 'nzbreakers.basketball', 'nbl.com.au', 'redbull.com'];
const STRENGTH_OUTLETS = ['barbend.com', 'theworldsstrongestman.com', 'giantslive.com', 'officialstrongman.com',
  'strongmanarchives.com', 'generationiron.com', 'fitnessvolt.com', 'evwsports.com', 'roguefitness.com', 'strongmanchampionsleague.com'];

const SEARCHES = [
  { id: 'gn-strongman', topic: 'strength', days: 10,
    q: '"World\'s Strongest Man" OR "Strongman Champions League" OR "Giants Live" OR "Rogue Invitational" OR "Official Strongman" OR "Arnold Strongman" OR "strongman competition"',
    allow: [...STRENGTH_OUTLETS, ...NZ_OUTLETS, ...GLOBAL_OUTLETS] },
  { id: 'gn-strong-sites', topic: 'strength', days: 21,
    q: 'strongman (site:barbend.com OR site:generationiron.com OR site:theworldsstrongestman.com OR site:giantslive.com OR site:fitnessvolt.com)',
    allow: STRENGTH_OUTLETS, must: /strongman|strongest|stoltman|hooper|atlas stone|log press|giants live|arm ?wrestl|powerlift/i },
  { id: 'gn-arm', topic: 'strength', days: 14,
    q: 'armwrestling OR "arm wrestling"',
    allow: [...STRENGTH_OUTLETS, ...NZ_OUTLETS, ...GLOBAL_OUTLETS] },
  { id: 'gn-league', topic: 'league', days: 4,
    q: '"NZ Warriors" OR "rugby league" OR NRL OR "Kiwi Ferns" OR "State of Origin"',
    allow: [...SPORT_OUTLETS, ...NZ_OUTLETS, ...GLOBAL_OUTLETS] },
  { id: 'gn-hoops', topic: 'sport', days: 7,
    q: '"Tall Blacks" OR "NZ Breakers" OR "Tall Ferns"',
    allow: [...SPORT_OUTLETS, ...NZ_OUTLETS, ...GLOBAL_OUTLETS] },
  { id: 'gn-mystery', topic: 'mystery', days: 10,
    q: '"unsolved mystery" OR UFO OR UAP OR cryptid OR paranormal OR "cold case" OR unexplained OR "lost city" OR shipwreck',
    allow: [...NZ_OUTLETS, ...GLOBAL_OUTLETS, 'livescience.com', 'atlasobscura.com', 'smithsonianmag.com', 'thedebrief.org',
      'nationalgeographic.com', 'popularmechanics.com', 'newscientist.com', 'skepticalinquirer.org', 'cbsnews.com', 'npr.org',
      'newsnationnow.com', 'cbc.ca', 'independent.co.uk', 'euronews.com'] },
  { id: 'gn-chch', topic: 'local', days: 3,
    q: 'Christchurch OR Canterbury OR Ōtautahi',
    allow: NZ_OUTLETS },
];

const OUTLET_NAMES = {
  'rnz.co.nz': ['RNZ', 'A'], 'nzherald.co.nz': ['NZ Herald', 'B'], 'stuff.co.nz': ['Stuff', 'B'],
  'thepress.co.nz': ['The Press', 'B'], 'thepost.co.nz': ['The Post', 'B'], 'odt.co.nz': ['ODT', 'B'],
  '1news.co.nz': ['1News', 'B'], 'newsroom.co.nz': ['Newsroom', 'B'], 'thespinoff.co.nz': ['The Spinoff', 'B'],
  'interest.co.nz': ['interest.co.nz', 'S'], 'bbc.co.uk': ['BBC', 'A'], 'bbc.com': ['BBC', 'A'],
  'reuters.com': ['Reuters', 'A'], 'apnews.com': ['AP', 'A'], 'abc.net.au': ['ABC (AU)', 'A'],
  'theguardian.com': ['The Guardian', 'B'], 'nytimes.com': ['NY Times', 'B'], 'espn.com': ['ESPN', 'B'],
  'olympics.com': ['Olympics.com', 'A'], 'nrl.com': ['NRL.com', 'A'], 'warriors.kiwi': ['Warriors (official)', 'A'],
  'nzrl.co.nz': ['NZ Rugby League', 'A'], 'fiba.basketball': ['FIBA', 'A'], 'nz.basketball': ['Basketball NZ', 'A'],
  'barbend.com': ['BarBend', 'S'], 'theworldsstrongestman.com': ["World's Strongest Man", 'A'],
  'giantslive.com': ['Giants Live', 'A'], 'officialstrongman.com': ['Official Strongman', 'A'],
  'ccc.govt.nz': ['Christchurch City Council', 'A'], 'redbull.com': ['Red Bull', 'S'],
};

// ---------------------------------------------------------------- junk filter
const JUNK = [
  /you won'?t believe/i, /\bshocking\b/i, /horoscope/i, /\bsponsored\b/i, /advertorial/i, /promo code/i,
  /\bcoupon/i, /\b\d{1,2}% off\b/i, /\bdeals?\b/i, /\bon sale\b/i, /\bcheapest\b/i, /black friday/i,
  /\bwordle\b/i, /connections hints?/i, /\bcrossword\b/i, /\bstrands\b.*hint/i, /^quiz\b/i, /\bquiz:/i,
  /in pictures/i, /\bphotos?:/i, /\bgallery\b/i, /\bbest .{1,40} (to buy|for 20\d\d)\b/i, /\bgift guide\b/i,
  /\breview round-?up\b/i, /\bcodes? \(?(november|december|january|february|march|april|may|june|july|august|september|october)/i,
  /\bobituar/i, /\blotto\b.*results/i, /\bpowerball\b/i, /\bweather:? (live|warning) updates\b/i,
  /\bwatch:? live\b/i, /- round \d+, (19|20)\d\d$/i, /live score/i, /gametracker/i, /^general debate/i, /scratch-?off|lottery (prize|jackpot|win)|wins? .{0,20}lottery/i, /^[\w'. ]+ - \d{1,2} \w+ 20\d\d$/, /^open thread/i, /^(daily|weekly) (digest|roundup)/i, /\bsignings? tracker\b/i, /\bopinion:/i, /^letters?:/i, /\bpodcast:?\b/i, /^the detail\b/i,
];
const isJunk = (t) => JUNK.some((r) => r.test(t)) || /[!?]{2,}/.test(t) || t.length < 18;

// ---------------------------------------------------------------- tagging
// Tags drive the learning on the phone ("more like this") and sub-topics.
const TAGS = [
  ['Strongman', /strongman|strongest (man|woman)|giants live|mitchell hooper|rayno nel|tom stoltman|hafthor|rogue invitational/i, 'strength'],
  ['Armwrestling', /arm ?wrestl|east vs west|devon larratt|levan saginashvili/i, 'strength'],
  ['Powerlifting', /powerlift|deadlift|weightlift/i, 'strength'],
  ['Warriors', /\bwarriors\b/i, 'league'],
  ['Kiwis', /kiwi ferns|\bkiwis\b.{0,60}\b(league|test|squad|coach|kangaroos|tonga|samoa|toa|world cup|v|vs)\b|\b(league|kangaroos|tonga|samoa)\b.{0,60}\bkiwis\b/i, 'league'],
  ['NRL', /\bnrl\b|state of origin|rugby league|broncos|bulldogs|cowboys|rabbitohs|raiders|roosters|sea eagles|wests tigers|titans|redcliffe dolphins|parramatta|cronulla|penrith|melbourne storm|st george|newcastle knights|meninga|kangaroos|png chiefs|perth bears/i, 'league'],
  ['Tall Blacks', /tall blacks|tall ferns|nz breakers|\bnbl\b/i, 'sport'],
  ['Basketball', /basketball|\bnba\b/i, 'sport'],
  ['All Blacks', /all blacks|black ferns|super rugby|crusaders/i, 'sport'],
  ['Cricket', /cricket|black caps|white ferns/i, 'sport'],
  ['Football', /football|premier league|all whites|phoenix|fifa/i, 'sport'],
  ['Combat sports', /\bufc\b|boxing|\bmma\b|kickbox/i, 'sport'],
  ['Motorsport', /formula 1|\bf1\b|supercars|motogp|nascar|liam lawson/i, 'sport'],
  ['Breaking', /breaking world|bc one|breakdanc/i, 'sport'],
  ['Christchurch', /christchurch|canterbury|ōtautahi|otautahi|selwyn|waimakariri|lyttelton|te kaha/i, 'local'],
  ['AI', /\bai\b|artificial intelligence|openai|chatgpt|anthropic|claude|gemini|llm/i, 'tech'],
  ['Phones', /iphone|android|pixel|galaxy s\d|smartphone/i, 'tech'],
  ['Apple', /\bapple\b|macbook|ios \d/i, 'tech'],
  ['Cybersecurity', /cyber|hack(ed|ers?)\b|ransomware|data breach/i, 'tech'],
  ['Nintendo', /nintendo|switch 2|zelda|mario|pok[eé]mon/i, 'gaming'],
  ['PlayStation', /playstation|\bps5\b|\bps6\b|sony interactive/i, 'gaming'],
  ['Xbox', /\bxbox\b|game pass|microsoft gaming/i, 'gaming'],
  ['PC gaming', /\bsteam\b|\bpc gaming\b|nvidia|\bamd\b|\bgpu\b/i, 'gaming'],
  ['Space', /\bnasa\b|spacex|rocket|launch|\bmoon\b|\bmars\b|asteroid|galax|telescope|astronaut|rocket lab/i, 'science'],
  ['Climate', /climate|emissions|warming|el ni[nñ]o/i, 'science'],
  ['Health', /\bhealth\b|cancer|vaccine|medical|hospital/i, 'science'],
  ['Movies', /\bfilm\b|movie|box office|trailer|marvel|\bdc\b studios/i, 'entertainment'],
  ['TV & streaming', /netflix|\bhbo\b|disney\+|streaming|\bseries\b|season \d/i, 'entertainment'],
  ['Music', /\balbum\b|\btour\b|concert|grammy|rapper|singer/i, 'entertainment'],
  ['Economy', /economy|inflation|interest rate|reserve bank|\bocr\b|recession|gdp/i, 'business'],
  ['Housing', /housing|house prices|rent(ers|al)?\b|mortgage/i, 'business'],
  ['Politics', /parliament|government|minister|election|luxon|hipkins|seymour|peters\b|labour|national party|greens/i, 'nz'],
  ['UFOs & UAP', /\bufos?\b|\buaps?\b|alien|extraterrestrial|flying saucer/i, 'mystery'],
  ['Unsolved', /unsolved|cold case|mysterious(ly)? (death|disappear)|vanish|missing for \d+|disappearance/i, 'mystery'],
  ['Cryptids', /cryptid|bigfoot|sasquatch|loch ness|yeti|chupacabra|moa sighting/i, 'mystery'],
  ['Paranormal', /paranormal|ghost|haunt|poltergeist|psychic|curse[ds]?\b/i, 'mystery'],
  ['Lost history', /lost city|ancient|archaeolog|tomb|mummy|shipwreck|treasure|artifact|artefact|pyramid/i, 'mystery'],
  ['Strange science', /mystery|mysterious|unexplained|baffl|bizarre|strange signal|anomal/i, 'mystery'],
  ['Crime', /police|court|charged|sentenced|murder|arrest/i, null],
  ['Weather', /metservice|weather|storm|flood|earthquake|red warning|orange warning/i, null],
];

// ---------------------------------------------------------------- helpers
const decode = (s = '') => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const stripHtml = (s = '') => decode(decode(s)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
};
const attr = (block, name, a) => {
  const m = block.match(new RegExp(`<${name}\\s[^>]*?${a}="([^"]+)"`, 'i'));
  return m ? decode(m[1]) : '';
};
const clip = (s, n) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const matchesDomain = (host, list) => list.some((d) => host === d || host.endsWith('.' + d));

async function get(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const title = stripHtml(tag(b, 'title'));
    let link = decode(tag(b, 'link')).trim();
    if (!link || link.startsWith('<')) link = attr(b, 'link', 'href');
    const date = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    const rawDesc = tag(b, 'description') || tag(b, 'summary') || tag(b, 'content') || tag(b, 'content:encoded');
    let image = attr(b, 'media:content', 'url') || attr(b, 'media:thumbnail', 'url')
      || (/<enclosure[^>]+type="image/i.test(b) ? attr(b, 'enclosure', 'url') : '');
    if (!image) {
      const m = decode(rawDesc + tag(b, 'content:encoded')).match(/<img[^>]+src="([^"]+)"/i);
      if (m) image = m[1];
    }
    // Ask for bigger versions of known small thumbnails (BBC gives 240px by default).
    image = image.replace('/standard/240/', '/standard/800/').replace(/([?&])(w|width)=\d{2,3}\b/, '$1$2=800');
    const source = tag(b, 'source');
    items.push({
      title, link, ts: Date.parse(stripHtml(date)) || NOW,
      summary: clip(stripHtml(rawDesc), 300), image: image.startsWith('http') ? image : '',
      gnSource: source ? { name: stripHtml(source), url: attr(b, 'source', 'url') } : null,
    });
  }
  return items;
}

const STOP = new Set(('a an the and or of to in on for at by with from as is are was were be been it its this that ' +
  'after over into about new says say said more than up out off how why what who will can could would not no ' +
  'nz new zealand first after amid his her their they he she we you your our have has had just one two three ' +
  'year years day week time back down still all').split(' '));
const tokens = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/['’]s\b/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

// ---------------------------------------------------------------- build stories
async function collect() {
  const raw = [];
  const status = [];
  await Promise.all(FEEDS.map(async (f) => {
    try {
      const items = parseFeed(await get(f.url));
      let kept = 0;
      for (const it of items) {
        if (NOW - it.ts > (f.days || 3) * 24 * HOUR || isJunk(it.title) || !it.link) continue;
        if (kept++ >= (f.max || 40)) break;
        raw.push({ ...it, source: f.name, sourceId: f.id, tier: f.tier, topic: f.topic });
      }
      status.push([f.id, 'ok', kept]);
    } catch (e) { status.push([f.id, 'fail', e.message]); }
  }));
  await Promise.all(SEARCHES.map(async (s) => {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(s.q + ` when:${s.days}d`)}&hl=en-NZ&gl=NZ&ceid=NZ:en`;
    try {
      const items = parseFeed(await get(url));
      let kept = 0;
      for (const it of items) {
        const host = hostOf(it.gnSource?.url || '');
        if (!matchesDomain(host, s.allow)) continue;
        const title = it.title.replace(/\s+-\s+[^-]+$/, '').replace(/\s+\|\s+[^|]+$/, '').trim();
        if (NOW - it.ts > s.days * 24 * HOUR || isJunk(title) || (s.must && !s.must.test(title))) continue;
        const known = Object.entries(OUTLET_NAMES).find(([d]) => matchesDomain(host, [d]));
        raw.push({
          title, link: it.link, ts: it.ts, summary: '', image: '',
          source: known ? known[1][0] : it.gnSource.name, sourceId: 'web:' + host,
          tier: known ? known[1][1] : 'S', topic: s.topic,
        });
        kept++;
      }
      status.push([s.id, 'ok', kept]);
    } catch (e) { status.push([s.id, 'fail', e.message]); }
  }));
  return { raw, status };
}

function enrich(it) {
  const text = `${it.title} ${it.summary}`;
  const tags = TAGS.filter(([, re]) => re.test(text)).map(([name]) => name);
  // A specific tag can move a story out of a broad section (e.g. NZ -> League).
  let topic = it.topic;
  const titleTag = TAGS.find(([, re, t]) => t && re.test(it.title));
  if (['nz', 'sport', 'world'].includes(topic) && titleTag && ['strength', 'league', 'sport', 'local'].includes(titleTag[2])) {
    topic = titleTag[2] === 'sport' && topic !== 'sport' ? 'sport' : titleTag[2];
  }
  if (topic === 'nz' && tags.includes('Christchurch')) topic = 'local';
  if (topic === 'science' && TAGS.some(([, re, t]) => t === 'mystery' && re.test(it.title))) topic = 'mystery';
  // Search results only keep a niche section when the story is really about it.
  if (topic === 'local' && !TAGS.find(([n]) => n === 'Christchurch')[1].test(it.title)) topic = 'nz';
  if (topic === 'league' && !tags.some((t) => ['NRL', 'Warriors', 'Kiwis'].includes(t))) topic = 'sport';
  return { ...it, topic, tags, tok: tokens(it.title) };
}

function cluster(items) {
  const sorted = items.sort((a, b) => b.ts - a.ts);
  const clusters = [];
  const seenLinks = new Set();
  const tierRank = { A: 3, B: 2, S: 1, O: 0, X: 0 };
  for (const it of sorted) {
    const key = it.link.split('?')[0];
    if (seenLinks.has(key)) continue;
    seenLinks.add(key);
    const set = new Set(it.tok);
    let best = null, bestScore = 0;
    for (const c of clusters) {
      if (Math.abs(c.ts - it.ts) > 36 * HOUR) continue;
      let inter = 0;
      for (const w of c.tokSet) if (set.has(w)) inter++;
      const jac = inter / (set.size + c.tokSet.size - inter || 1);
      const score = inter >= 4 && jac >= 0.25 ? Math.max(jac, 0.45) : jac;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (best && bestScore >= 0.42) {
      // Same headline from the same outlet (e.g. two RNZ section feeds) is a duplicate, not extra coverage.
      if (!best.items.some((x) => x.source === it.source && x.title === it.title)) best.items.push(it);
    } else {
      clusters.push({ ts: it.ts, tokSet: set, items: [it] });
    }
  }
  return clusters.map((c) => {
    // Lead = most trusted, then the one with a picture and summary, then newest.
    const items = c.items.sort((a, b) => (tierRank[b.tier] - tierRank[a.tier]) || (!!b.summary - !!a.summary) || (b.ts - a.ts));
    const lead = items[0];
    const image = lead.image || items.find((x) => x.image)?.image || '';
    const summary = lead.summary || items.find((x) => x.summary)?.summary || '';
    const tags = [...new Set(items.flatMap((x) => x.tags))];
    const id = hash(lead.link);
    return {
      id, title: lead.title, link: lead.link, source: lead.source, sourceId: lead.sourceId, tier: lead.tier, lean: LEAN[lead.source] || '',
      topic: lead.topic, tags, summary, image, ts: Math.max(...items.map((x) => x.ts)),
      first: Math.min(...items.map((x) => x.ts)), words: [...c.tokSet].slice(0, 14),
      coverage: items.slice(1, 10).map((x) => ({ source: x.source, tier: x.tier, lean: LEAN[x.source] || '', title: x.title, link: x.link, ts: x.ts })),
    };
  });
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------- events
const WATCH_HOSTS = { 'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'x.com': 'X (Twitter)', 'twitter.com': 'X (Twitter)',
  'plus.nasa.gov': 'NASA+', 'nasa.gov': 'NASA', 'rocketlabcorp.com': 'Rocket Lab', 'spacex.com': 'SpaceX' };
async function buildEvents() {
  const curated = JSON.parse(await readFile(path.join(DATA, 'events-curated.json'), 'utf8'));
  const events = curated.events.map((e) => ({ ...e, origin: 'curated' }));
  const status = [];

  // Space launches with live webcast links (The Space Devs, free tier).
  try {
    const d = JSON.parse(await get('https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=12&mode=detailed'));
    for (const l of d.results || []) {
      const t = Date.parse(l.net);
      if (!t || t - NOW > 30 * 24 * HOUR) continue;
      const vids = (l.vid_urls || []).map((v) => ({ label: v.publisher?.name || WATCH_HOSTS[hostOf(v.url)] || 'Webcast', url: v.url }));
      const prov = l.launch_service_provider?.name || '';
      // Only launches you can actually watch, plus every Rocket Lab launch (from Mahia, NZ).
      if (!vids.length && !/rocket lab/i.test(prov)) continue;
      const seen = new Set();
      const uniq = vids.filter((v) => !seen.has(v.label) && seen.add(v.label));
      vids.length = 0; vids.push(...uniq);
      events.push({
        id: 'launch-' + l.id, title: `🚀 ${l.name}`, start: l.net, allDay: false,
        category: 'Space', tags: /rocket lab/i.test(prov) ? ['Space', 'Rocket Lab'] : ['Space'], location: l.pad?.location?.name || '',
        note: [prov, l.mission?.description].filter(Boolean).join(' — ').slice(0, 260),
        tbc: !['Go', 'Go for Launch'].includes(l.status?.name) ? (l.status?.name || 'TBC') : '',
        watch: vids.length ? vids.slice(0, 2) : [{ label: 'Find webcast', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(l.name + ' launch live')}` }],
        origin: 'live',
      });
    }
    status.push(['launches', 'ok']);
  } catch (e) { status.push(['launches', 'fail', e.message]); }

  // NRL fixtures once the season is published (TheSportsDB free key).
  try {
    const d = JSON.parse(await get('https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php?id=4416'));
    for (const ev of d.events || []) {
      const start = ev.strTimestamp ? ev.strTimestamp + 'Z' : ev.dateEvent;
      const isWarriors = /warriors/i.test(ev.strEvent);
      events.push({
        id: 'nrl-' + ev.idEvent, title: `🏉 NRL: ${ev.strHomeTeam} v ${ev.strAwayTeam}`, start, allDay: !ev.strTimestamp,
        category: 'League', tags: isWarriors ? ['NRL', 'Warriors'] : ['NRL'], location: ev.strVenue || '',
        note: ev.intRound ? `Round ${ev.intRound}` : '',
        watch: [{ label: 'Sky Sport NZ', url: 'https://www.sky.co.nz/sport' }, { label: 'Sky Sport Now', url: 'https://www.skysportnow.co.nz' }],
        origin: 'live',
      });
    }
    status.push(['nrl', 'ok', (d.events || []).length]);
  } catch (e) { status.push(['nrl', 'fail', e.message]); }

  const cutoff = NOW - 36 * HOUR;
  const live = events.filter((e) => Date.parse(e.end || e.start) >= cutoff)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return { events: live, status };
}

// ---------------------------------------------------------------- main
const { raw, status } = await collect();
const stories = cluster(raw.map(enrich)).sort((a, b) => b.ts - a.ts).slice(0, 800);
const ev = await buildEvents();
await mkdir(DATA, { recursive: true });
await writeFile(path.join(DATA, 'feed.json'), JSON.stringify({ generated: new Date(NOW).toISOString(), stories }));
await writeFile(path.join(DATA, 'events.json'), JSON.stringify({ generated: new Date(NOW).toISOString(), events: ev.events }));
const fails = [...status, ...ev.status].filter((s) => s[1] === 'fail');
console.log(`stories: ${stories.length} from ${raw.length} items; events: ${ev.events.length}`);
console.log([...status, ...ev.status].map((s) => s.join(' ')).join('\n'));
if (fails.length > FEEDS.length / 2) { console.error('Too many sources failed'); process.exit(1); }
