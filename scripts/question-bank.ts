/** Real questions sellers ask at each stage. Scout must answer every one without falling back. */
import type { Ctx } from '../lib/acts';
import { DEFAULT_PROFILE } from '../lib/data';

const base: Ctx = { stage: 'opportunities', profile: DEFAULT_PROFILE, productId: null, focusProductId: null, focusSupplierId: null, contacted: [], quotesReady: false, sampleIds: [], samplesRequested: false, recall: { productId: null, supplierId: null }, auto: false };
export const CTX: Record<string, Ctx> = {
  start: { ...base, stage: 'start' },
  cat: { ...base, stage: 'category' },
  opp: base,
  sup: { ...base, stage: 'suppliers', productId: 'travel-set' },
  wait: { ...base, stage: 'waiting', productId: 'travel-set', contacted: ['ningbo', 'shenzhen', 'haiphong'] },
  quo: { ...base, stage: 'quotes', productId: 'travel-set', contacted: ['ningbo', 'shenzhen', 'haiphong'], quotesReady: true, sampleIds: ['ningbo', 'shenzhen'] },
  chk: { ...base, stage: 'check', productId: 'travel-set', contacted: ['ningbo', 'shenzhen', 'haiphong'], quotesReady: true, sampleIds: ['ningbo', 'shenzhen'], samplesRequested: true },
  done: { ...base, stage: 'done', productId: 'travel-set', contacted: ['ningbo', 'shenzhen', 'haiphong'], quotesReady: true, sampleIds: ['ningbo', 'shenzhen'], samplesRequested: true },
};
export const BANK: [string, string][] = [
  // general / meta
  ['start', 'what can you do?'], ['start', 'how does this work?'], ['start', 'who are you'], ['start', 'is this free?'], ['opp', 'how do you make money?'],
  ['opp', 'can I trust your numbers?'], ['opp', 'where does your data come from?'], ['opp', 'are you an AI?'],
  ['start', 'I want to sell something profitable'], ['start', 'what is trending right now?'], ['start', 'what sells best in the US?'],
  ['cat', 'why pet supplies?'], ['cat', 'can I look at electronics instead?'], ['opp', 'do you have other categories?'],
  ['start', 'How do you pick which products to show me?'], ['opp', 'how are the products ranked?'],
  ['cat', 'why 1750 when my budget is 2500'], ['start', 'why is my first order only $1,750?'],
  ['chk', 'what counts as a problem?'], ['chk', 'can you check the samples for me?'], ['chk', 'what should I check?'], ['chk', 'what is the difference between a problem and a minor issue?'],
  ['cat', 'Why not another category?'], ['cat', 'what about kitchen?'], ['cat', 'is home fitness a good idea?'], ['opp', 'how does the yoga mat do?'], ['cat', 'which category is best for me?'], ['cat', 'which category is best for me?'], ['cat', 'can I sell clothes instead?'], ['opp', 'is beauty a good category?'],
  ['start', 'I want to sell phone accessories'], ['opp', 'what would it take to sell toys?'], ['opp', 'what about dog toys?'], ['cat', 'what else can I sell?'],
  // products
  ['opp', 'which product is best?'], ['opp', 'what would you avoid?'], ['opp', 'why is the hair roller bad?'], ['opp', 'why is the lick mat ranked 4th?'],
  ['opp', 'explain the slow feeder'], ['opp', 'what is the risk with the travel set?'], ['opp', 'how competitive is the lick mat?'], ['opp', 'is the LED collar seasonal?'],
  ['opp', 'what is the margin on the travel set?'], ['opp', 'what price should I sell the slow feeder at?'], ['opp', 'can I sell it for $29.99?'],
  ['opp', 'what if ads cost $12?'], ['opp', 'how many units do I need to sell to break even?'], ['opp', 'how much stock do I need to buy?'],
  ['opp', 'why is the window perch not shown?'], ['opp', 'what does over budget mean?'], ['opp', 'show me the cheapest product'], ['opp', 'which is the least risky?'],
  ['opp', 'what about the dog bed?'], ['opp', 'which product has the best demand?'], ['opp', 'compare the travel set and the slow feeder'],
  ['opp', 'what if I sell on Amazon?'], ['opp', 'what if I sold in the UK on Amazon with $4000?'], ['opp', 'I only have $1000'],
  ['opp', 'how long until I make money?'], ['opp', 'how much can I earn per month?'], ['opp', 'what are the shipping costs?'], ['opp', 'what is duty for the US?'],
  ['opp', 'why do you keep 30% back?'], ['opp', 'can I use all my budget?'], ['opp', 'what does steady demand mean?'], ['opp', 'change my priorities to profit'],
  ['opp', 'I care about growth'], ['opp', 'I am an experienced seller'], ['opp', 'what are ads per sale?'], ['opp', 'what are returns?'],
  // suppliers
  ['sup', 'who is the best supplier?'], ['sup', 'why not Dongguan?'], ['sup', 'is Xiamen safe?'], ['sup', 'what does promoted mean?'], ['sup', 'why would a supplier pay for promotion?'], ['sup', 'can suppliers pay to rank higher?'], ['sup', 'how could Xiamen get on the shortlist?'], ['sup', 'what is Orvane Verified?'], ['sup', 'why is Yiwu set aside?'],
  ['sup', 'which supplier is fastest?'], ['sup', 'can I negotiate?'], ['sup', 'what is a trading company?'], ['sup', 'do they make the product or resell it?'],
  ['sup', 'what will the message say?'], ['sup', 'will my email be shared?'], ['sup', 'what if no one replies?'], ['sup', 'how do I pay them?'],
  ['sup', 'is Vietnam better than China?'], ['sup', 'what is MOQ'], ['sup', 'can I order less than 300?'], ['sup', 'why only 3 suppliers?'],
  // waiting / quotes
  ['wait', 'any replies yet?'], ['wait', 'how long do suppliers take?'], ['wait', 'can I cancel the message?'],
  ['quo', 'which quote is best?'], ['quo', 'why did Ningbo lower its price?'], ['quo', 'why not sample Hai Phong?'], ['quo', 'should I sample all three?'],
  ['quo', 'how much are samples?'], ['quo', 'what does the logo printing cost?'], ['quo', 'what next?'],
  // done
  ['done', 'what happens now?'], ['done', 'when will samples arrive?'], ['done', 'how do I check a sample?'], ['done', 'can I start over?'], ['done', 'what if the sample is bad?'],
  // misc
  ['opp', 'thanks!'], ['opp', 'ok'], ['opp', 'hmm'], ['opp', 'tell me a joke'], ['opp', 'what is the weather in Dhaka'], ['opp', 'help'],
];

/** The 85 journey questions from the Scout question map (the store handles "undo" itself). */
export const JOURNEY: [string, string][] = [
['start','What can you do for me, and what can\'t you do?'],['opp','Where do your numbers come from, and how fresh are they?'],['opp','Which numbers are checked and which are your guesses?'],['opp','How does Orvane make money?'],['sup','Can a supplier pay to be ranked higher?'],['opp','Will you send messages or pay for anything without asking me?'],['start','Is this free?'],['start','Do I need experience to use this?'],
['cat','What should I sell with my budget?'],['cat','Which category is best for a beginner?'],['cat','Why this category and not another one?'],['start','Which country should I sell in first?'],['opp','Is this category growing or shrinking?'],['cat','Can I sell clothes?'],['opp','Should I sell on Amazon or on my own store?'],
['opp','What\'s selling well right now?'],['opp','Which product would you pick, and why?'],['opp','Show me products that are easy to ship'],['opp','Is this a trend that will fade?'],['opp','Does this sell all year or only in one season?'],['opp','Can I improve this product to stand out?'],['opp','I found this product on Amazon, can you find it for me?'],
['opp','How much will I really make on each sale?'],['opp','What price should I sell it at?'],['opp','Where does my money go on each sale?'],['opp','What if ads cost more than you think?'],['opp','How much stock can I buy with my budget?'],['opp','How many sales until I get my money back?'],['opp','What is the total cost to get the goods to my door?'],
['opp','What is the biggest risk with this product?'],['opp','How crowded is this market?'],['opp','Will many customers send it back?'],['opp','Does this product need safety certificates to sell in the US?'],['opp','Could I get in trouble for copying a design?'],['opp','Is this allowed on Amazon?'],['opp','What would make you change your mind about this product?'],
['sup','Who can make this product?'],['sup','Why is this supplier ranked first?'],['sup','Are there suppliers outside China?'],['sup','Can I find a supplier that makes small orders?'],['sup','Which supplier is fastest?'],['sup','Is this a real factory or a middleman?'],
['sup','Can I trust this supplier?'],['sup','What does Orvane Verified actually check?'],['sup','Has anyone had problems with them before?'],['sup','Why is this supplier marked as promoted?'],['sup','What would this supplier need to do to rank higher?'],['sup','Who actually makes the product?'],
['quo','Which quote is the best deal?'],['quo','Are these quotes really for the same product?'],['quo','Can you ask for a lower price?'],['quo','What happens to the price if I order more?'],['quo','Ningbo gave a better deal, can you ask Shenzhen to match it?'],['wait','A supplier hasn\'t replied, can you chase them?'],['quo','I changed my design, can you tell all suppliers?'],
['quo','Which suppliers should I get samples from?'],['done','How long will samples take, and what will they cost?'],['chk','What should I check when samples arrive?'],['chk','What counts as a real problem?'],['chk','Both samples failed, what now?'],['chk','How do I make sure the big order matches the sample?'],
['done','How much should I order the first time?'],['done','How do I pay, and is my money safe?'],['done','What should the order include so I\'m protected?'],['done','How long will production take?'],['done','Can someone check the goods before they ship?'],['done','What if the supplier is late or the goods are broken?'],
['done','When will my order arrive?'],['done','Should I ship by sea or by air?'],['done','How much duty will I pay?'],['done','Who handles customs for me?'],['done','Where is my order right now?'],['done','Can it go straight to an Amazon warehouse?'],
['done','How are my sales going?'],['done','Why did my profit drop this month?'],['done','When should I reorder?'],['done','Customers are complaining about the lid, should I fix it?'],['done','Should I switch suppliers?'],['done','What should my second product be?'],
['opp','Change my budget to $4,000'],['opp','Compare the top three'],['opp','Why did the ranking change?'],['opp','Run the rest for me'],['quo','Go back to suppliers'],['opp','Explain that more simply'],
];
