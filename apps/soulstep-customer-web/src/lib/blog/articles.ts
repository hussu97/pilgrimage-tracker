/**
 * Static blog article content for SoulStep.
 * Each article is 600+ words of original editorial content.
 */

export interface ArticleSection {
  heading?: string;
  paragraphs: string[];
}

export interface Article {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  readingTime: number;
  category: string;
  coverGradient: string;
  content: ArticleSection[];
}

export const articles: Article[] = [
  {
    slug: `best-mosques-dubai`,
    title: `The Most Visited Mosques in Dubai: A Complete Guide`,
    description: `Discover the most beautiful and historically significant mosques in Dubai, from the iconic Jumeirah Mosque to the Grand Mosque. A complete guide for spiritual visitors and cultural explorers.`,
    publishedAt: `2026-03-20`,
    readingTime: 7,
    category: `Islam`,
    coverGradient: `from-emerald-600 to-teal-800`,
    content: [
      {
        paragraphs: [
          `Dubai is a city of extraordinary contrasts. Gleaming skyscrapers rise beside ancient wind towers, and modern highways lead to centuries-old souks. Yet at the heart of this remarkable metropolis lies a deep and abiding spiritual heritage expressed most powerfully through its mosques. Whether you are a Muslim seeking a place of prayer or a cultural visitor hoping to understand Emirati life and Islamic tradition, the mosques of Dubai offer an experience unlike any other.`,
          `The city is home to more than 1,400 mosques, ranging from modest neighbourhood prayer halls to grand architectural landmarks that attract visitors from around the world. Each tells a different story about faith, community, and the enduring presence of Islam in the Gulf.`,
        ],
      },
      {
        heading: `Jumeirah Mosque: The Most Photographed Islamic Site in Dubai`,
        paragraphs: [
          `The Jumeirah Mosque is without question the most recognisable mosque in Dubai. Built in the Fatimid style and completed in 1979, it is constructed from white stone and features two soaring minarets flanking a central dome, creating a silhouette that appears almost otherworldly when lit at night. Unlike many mosques in the UAE, Jumeirah Mosque actively welcomes non-Muslim visitors through its Open Doors, Open Minds programme run by the Sheikh Mohammed Centre for Cultural Understanding.`,
          `Tours run six mornings a week and include a guided explanation of Islamic beliefs and practices, a walk through the prayer halls, and time for questions. Visitors are asked to dress modestly — women receive abayas to wear during the visit. The experience is genuinely welcoming and provides rare insight into Muslim prayer, the significance of the Quran, and the role of the mosque in daily Emirati life. If you visit only one mosque in Dubai, this is the one.`,
        ],
      },
      {
        heading: `Grand Mosque (Diwan Mosque): The Historic Heart of the City`,
        paragraphs: [
          `Located in the Al Fahidi historical neighbourhood near Dubai Creek, the Grand Mosque (also known as the Diwan Mosque) is one of the oldest and most spiritually significant mosques in the emirate. The original structure dates to 1900, though the current building is a reconstruction completed in 1998. It remains the largest mosque in the historic district, capable of accommodating over 1,200 worshippers.`,
          `The Grand Mosque features 45 smaller domes, a single prominent minaret rising 70 metres, and beautifully tiled interiors that draw on traditional Islamic geometric patterns. It sits within walking distance of the Al Fahidi Fort, making it a natural stop on any tour of the city heritage quarter. The area surrounding the mosque on Fridays is particularly atmospheric, with worshippers arriving for Jumuah prayer as the call to prayer echoes across the creek.`,
        ],
      },
      {
        heading: `Al Farooq Omar Bin Al Khattab Mosque: A Monument to Generosity`,
        paragraphs: [
          `Opened in 2011 in the Al Safa neighbourhood, Al Farooq Omar Bin Al Khattab Mosque is one of the largest mosques in the UAE, accommodating up to 2,000 worshippers inside and several thousand more in its surrounding gardens. Named after the second Caliph of Islam, the mosque was built at a cost of approximately AED 50 million and represents a striking blend of Ottoman and Andalusian architectural influences.`,
          `The interior is breathtaking: 124 stained-glass windows fill the prayer hall with coloured light, while imported Italian marble floors and hand-painted ceilings create an atmosphere of profound serenity. A small replica of the Prophet Mosque in Madinah sits within the complex, adding additional layers of spiritual significance. Non-Muslim visitors are welcome on guided tours arranged through the mosque management. Prayer times follow the standard schedule broadcast by the Dubai Islamic Affairs Authority.`,
        ],
      },
      {
        heading: `Visitor Tips and Practical Information`,
        paragraphs: [
          `When visiting any mosque in Dubai, modest dress is essential. Men should wear long trousers and shirts with sleeves; women should cover their hair, arms, and legs. Shoes must be removed before entering prayer halls. Photography is generally permitted in common areas but should be avoided during active prayer times.`,
          `Prayer times in Dubai change daily according to the Islamic lunar calendar and the position of the sun. The five daily prayers — Fajr (dawn), Dhuhr (midday), Asr (afternoon), Maghrib (sunset), and Isha (night) — are announced via the adhan broadcast from minarets across the city. During Ramadan, mosques take on heightened significance and many offer iftar meals open to the public after sunset prayer.`,
          `Using the SoulStep app, you can track your visits to each of these mosques, set reminders for prayer times, and join organised group journeys to explore the sacred sites of Dubai together. The platform maps over 200 mosques across the emirate, with visitor notes, opening hours, and guided tour availability for each location.`,
        ],
      },
    ],
  },
  {
    slug: `sacred-hindu-temples-south-india`,
    title: `Sacred Hindu Temples of South India: Spiritual Heritage Guide`,
    description: `Journey through the magnificent Hindu temples of South India — from the golden gopurams of Madurai to the sacred hills of Tirupati. A guide to the most spiritually significant sites in the region.`,
    publishedAt: `2026-03-28`,
    readingTime: 8,
    category: `Hinduism`,
    coverGradient: `from-orange-500 to-red-700`,
    content: [
      {
        paragraphs: [
          `South India is home to some of the oldest, most architecturally extraordinary, and spiritually significant Hindu temples on earth. The Dravidian style of temple architecture — characterised by towering, intricately carved gopurams (gateway towers), vast mandapams (pillared halls), and sacred tank reservoirs — reaches its highest expression in the states of Tamil Nadu, Kerala, Andhra Pradesh, and Telangana. For pilgrims and travellers alike, a journey through these temples is a journey into the living heart of Hinduism.`,
          `Unlike many ancient religious sites elsewhere in the world, these temples are not museums. They are active centres of worship visited by millions of devotees each year. The rituals performed within them follow traditions that in some cases stretch back over two thousand years, and the communities that sustain them represent an unbroken chain of faith and cultural continuity.`,
        ],
      },
      {
        heading: `Tirumala Venkateswara Temple, Tirupati: The Most Visited Pilgrimage Site in the World`,
        paragraphs: [
          `Perched 853 metres above sea level on the Tirumala Hills in Andhra Pradesh, the Venkateswara Temple at Tirupati is the wealthiest and most visited religious institution in the world. Dedicated to Lord Venkateswara, a form of Vishnu, the temple receives an average of 50,000 to 100,000 pilgrims per day — on major festival days, this figure exceeds 400,000. The Tirumala Tirupati Devasthanams (TTD) trust that administers the temple has an annual income running into hundreds of crores of rupees, much of which is channelled into educational and charitable activities across the state.`,
          `The experience of darshan (a sacred viewing of the deity) at Tirupati is unlike anything else in world religion. Pilgrims often wait for many hours in serpentine queues before reaching the sanctum sanctorum for a brief but intensely charged moment in the presence of the idol. Many devotees tonsure (shave) their heads at the temple as an offering, a practice so widespread that Tirupati operates one of the largest hair auction businesses in the world, with the proceeds going to temple charities.`,
        ],
      },
      {
        heading: `Meenakshi Amman Temple, Madurai: A City Within a Temple`,
        paragraphs: [
          `The Meenakshi Amman Temple in Madurai, Tamil Nadu, is arguably the most spectacular example of Dravidian temple architecture in existence. Dedicated to the goddess Meenakshi (a form of Parvati) and her consort Sundareshvara (Shiva), the temple complex covers 14 acres and contains 14 gopurams — the tallest rising to 51.9 metres — adorned with thousands of brilliantly painted sculptural figures. The temple is estimated to contain over 33,000 stone sculptures.`,
          `Unlike many temples that restrict access during rituals, Meenakshi Amman maintains an almost continuous programme of activity open to all Hindus. The daily Alankaram (decoration) ceremonies, the procession of the deity each evening through the corridors of the Golden Lotus Tank, and the annual Chithirai Festival — which celebrates the divine marriage of Meenakshi and Sundareshvara and draws over a million visitors — make this not just a place of worship but a living theatrical event of extraordinary beauty.`,
        ],
      },
      {
        heading: `Brihadeeswarar Temple, Thanjavur: UNESCO Heritage and Architectural Marvel`,
        paragraphs: [
          `Built by the great Chola emperor Rajaraja I and completed in 1010 CE, the Brihadeeswarar Temple in Thanjavur is a World Heritage Site and one of the supreme achievements of Indian architecture. The vimana (tower above the sanctum) rises to 66 metres and is topped by a single granite capstone estimated to weigh 80 tonnes. The precision engineering required to place this capstone — dragged up an inclined plane stretching several kilometres — continues to astonish engineers to this day.`,
          `The temple is dedicated to Shiva in his form as Brihadeeswarar (the Great Lord). Its walls bear magnificent frescoes and inscriptions that record in meticulous detail the administrative, economic, and religious life of the Chola empire. The temple complex also houses a Nandi (sacred bull) monolith carved from a single rock and standing over 3.7 metres high. Those who make the journey encounter something rare: contemplative space and architectural grandeur in almost equal measure.`,
        ],
      },
      {
        heading: `Padmanabhaswamy Temple, Thiruvananthapuram: The Reclining Vishnu`,
        paragraphs: [
          `The Padmanabhaswamy Temple in Kerala is one of the 108 Divya Desams — sacred Vishnu temples celebrated in the hymns of the Alvars. The presiding deity, Padmanabha, is depicted in a rare form: Vishnu reclining on the cosmic serpent Ananta Shesha, his body extending across three separate doorways of the sanctum. The idol is made from a special herbal mixture called Katusarkara Yogam and is over 18 feet in length.`,
          `The temple gained worldwide attention in 2011 when archaeological surveys of its vaults revealed treasures — gold, jewels, and ancient artefacts — estimated to be worth over a trillion Indian rupees, making it the wealthiest temple in the world by asset value. Admission is restricted to Hindus, and visitors must wear traditional dress (dhoti for men, sari or set-mundu for women). The evening sheveli (procession) ritual, performed daily, is one of the most serene spiritual experiences Kerala offers.`,
        ],
      },
      {
        heading: `Planning Your Temple Journey`,
        paragraphs: [
          `South Indian temples observe dress codes strictly — bare shoulders, short skirts, and sleeveless tops are not permitted in any sanctum. Most temples provide cloth wraps for those who need them. Non-Hindus are welcome at many temples, including Meenakshi and Brihadeeswarar, but access to the innermost sanctums is typically restricted to Hindus only. Photography rules vary widely — always check signage and ask temple staff before taking pictures.`,
          `SoulStep makes it easy to plan a connected temple journey across South India, allowing you to log check-ins, leave notes for fellow pilgrims, and access opening hours and special event dates for each site. The app supports content in Tamil, Malayalam, Telugu, and Hindi alongside English, reflecting the linguistic diversity of the region.`,
        ],
      },
    ],
  },
  {
    slug: `how-to-plan-spiritual-journey`,
    title: `How to Plan a Meaningful Spiritual Journey with SoulStep`,
    description: `A step-by-step guide to planning a deeply personal spiritual journey — whether solo or with a group. Learn how SoulStep journeys, check-ins, and community features help you make the most of sacred travel.`,
    publishedAt: `2026-04-02`,
    readingTime: 6,
    category: `Travel Guide`,
    coverGradient: `from-violet-600 to-indigo-800`,
    content: [
      {
        paragraphs: [
          `A spiritual journey is more than a travel itinerary. It is an intentional act — a decision to move through the world with awareness, to seek out places that carry centuries of human longing, prayer, and meaning, and to allow those encounters to leave a mark on you. Whether you are embarking on a formal religious pilgrimage, exploring the sacred sites of a faith tradition you are curious about, or simply seeking stillness in places that have been revered for generations, the experience is shaped as much by how you approach it as by the places themselves.`,
          `SoulStep was built specifically to support this kind of travel. Unlike general-purpose travel apps, it focuses entirely on sacred sites — mosques, temples, churches, gurdwaras, shrines, and holy natural sites — and provides tools designed around the rhythms and needs of spiritual pilgrimage rather than tourism. Here is how to use it to plan a journey that matters.`,
        ],
      },
      {
        heading: `Step 1: Define Your Intention`,
        paragraphs: [
          `Every meaningful journey begins with clarity of purpose. Before opening any app or booking any travel, take time to ask yourself what you are actually seeking. Are you tracing the steps of a particular religious tradition? Reconnecting with your own faith after a period of distance? Exploring spiritual traditions different from your own? Each of these intentions calls for a different kind of journey.`,
          `Your intention will shape everything else: which sites you visit, how long you spend at each, whether you travel solo or with others, and how you prepare yourself spiritually and practically. Write it down. Return to it when you feel overwhelmed by logistics or tempted to rush from site to site without pausing.`,
        ],
      },
      {
        heading: `Step 2: Create a Journey in SoulStep`,
        paragraphs: [
          `Once you know your intention, create a Journey in the SoulStep app. A Journey is a personalised collection of sacred sites that you plan to visit — think of it as a living map of your pilgrimage. To create one, tap the New Journey button from the home screen and give it a name that reflects your purpose.`,
          `From there, use the Explore or Search features to find places relevant to your journey. SoulStep contains over 100,000 sacred sites worldwide, categorised by religion, tradition, and location. You can filter by city, country, or religion, browse by proximity to your current location, or search directly for specific sites by name. As you find places that resonate, add them to your Journey with a single tap.`,
          `The app will show you your Journey as a map and a list, making it easy to plan a logical route that minimises travel time between sites — or to deliberately take the slower, less direct path that allows for unexpected encounters along the way.`,
        ],
      },
      {
        heading: `Step 3: Check In as You Go`,
        paragraphs: [
          `Checking in at each site is the core ritual of SoulStep. When you arrive at a sacred place on your Journey, open the app and tap the check-in button on the place detail page. This records your visit, updates your Journey progress, and adds a moment to your personal spiritual travel record.`,
          `Check-ins are private by default; only you can see them unless you choose to share them with a group. Many pilgrims find that the act of deliberately marking an arrival — rather than simply passing through — transforms the experience. It is a small gesture of attention: a way of saying that you are present and that this place matters.`,
          `Over time, your check-in history becomes something like a spiritual diary: a record of every sacred threshold you have crossed, every prayer you have offered, every moment of stillness you have found in a noisy world.`,
        ],
      },
      {
        heading: `Step 4: Travel with a Group`,
        paragraphs: [
          `Some of the most meaningful spiritual journeys are made in community. If you are travelling with family, a congregation, or a group of friends who share a common purpose, SoulStep Groups feature lets you create a shared journey and experience the pilgrimage together in real time.`,
          `As the group admin, you can build a shared itinerary and invite others to join. Each member can check in independently at each site, and the app tracks group progress collectively. You can leave notes for other group members at specific locations — a reading, a reflection, or practical information about the site. The group view gives everyone a shared sense of forward movement, even when members are exploring independently at different paces.`,
          `Group journeys are particularly powerful for multigenerational family pilgrimages — a grandmother tracking her grandchildren checking in at the same sites she visited decades ago, or young people understanding their family faith in a new way by walking its sacred geography together.`,
        ],
      },
      {
        heading: `Step 5: Reflect and Return`,
        paragraphs: [
          `The journey does not end when you arrive home. In many spiritual traditions, the integration of pilgrimage experience — the slow digestion of what you have seen, felt, and understood — is considered as important as the journey itself. SoulStep profile section gives you a permanent record of every place you have visited, every journey you have completed, and every moment you chose to be present.`,
          `Many users return to their check-in history in quiet moments to remember particular sites, to share their experience with others who are planning similar journeys, or simply to notice how their spiritual geography has expanded over time. SoulStep is not just a tool for planning travel; it is a record of a life lived in search of meaning.`,
        ],
      },
    ],
  },
  {
    slug: `churches-holy-land`,
    title: `Pilgrimage to the Holy Land: Essential Churches and Sacred Sites`,
    description: `An essential guide to the most significant Christian pilgrimage sites in the Holy Land — the Church of the Holy Sepulchre, the Church of the Nativity, the Mount of Olives, and more.`,
    publishedAt: `2026-04-08`,
    readingTime: 8,
    category: `Christianity`,
    coverGradient: `from-amber-500 to-yellow-700`,
    content: [
      {
        paragraphs: [
          `For nearly two thousand years, Christians from every denomination and every corner of the world have undertaken the journey to the Holy Land — the strip of territory along the eastern Mediterranean where, according to Christian scripture, Jesus of Nazareth was born, lived, taught, died, and rose from the dead. The pilgrimage tradition is older than the Crusades, older than the great cathedrals of Europe, older than Christianity itself as a formal institution. It is rooted in the fundamental human impulse to stand in the place where the sacred became tangible.`,
          `Today, the major sites of Christian pilgrimage are concentrated in modern-day Israel and the Palestinian territories, with Jerusalem at the centre. Despite the political complexity of the region, millions of pilgrims arrive each year — from Europe, the Americas, Africa, Asia, and the Pacific — to walk the streets described in the Gospels and pray in spaces that have been sanctified by unbroken centuries of Christian devotion.`,
        ],
      },
      {
        heading: `Church of the Holy Sepulchre, Jerusalem: The Central Site of Christian Pilgrimage`,
        paragraphs: [
          `Built over what is traditionally identified as the site of Golgotha (where Jesus was crucified) and the tomb from which he is said to have risen, the Church of the Holy Sepulchre is the most sacred site in Christianity. The current structure, a complex of interconnected chapels, corridors, and courtyards, incorporates building phases stretching from the original Constantinian basilica of 335 CE to Crusader reconstructions of the 12th century and later restorations.`,
          `The church is shared — often uneasily — by six Christian denominations: the Greek Orthodox, Roman Catholic, Armenian Apostolic, Ethiopian Orthodox, Coptic Orthodox, and Syriac Orthodox churches. Each controls specific areas and chapels within the complex, and the daily schedules of services, processions, and access are governed by a centuries-old arrangement known as the Status Quo. For the pilgrim, this complexity adds to rather than diminishes the experience: the church is a living ecosystem of global Christianity, its incense-heavy air carrying prayers in dozens of languages simultaneously.`,
          `The two focal points for most pilgrims are the Edicule — the small shrine encasing the tomb — and the Stone of Unction, a flat marble slab near the entrance where the body of Jesus is said to have been anointed before burial. Both attract long queues at peak times; arriving very early in the morning offers a more contemplative experience.`,
        ],
      },
      {
        heading: `Church of the Nativity, Bethlehem: Birthplace of Jesus`,
        paragraphs: [
          `Located six kilometres south of Jerusalem in the city of Bethlehem — now within Palestinian Authority territory — the Church of the Nativity is one of the oldest continuously operating churches in the world. The original basilica was commissioned by Emperor Constantine I and completed around 333 CE; the current structure dates largely to the reign of Emperor Justinian in the 6th century. In 2012, it became the first site in Palestine to be inscribed on the UNESCO World Heritage List.`,
          `At the heart of the church is the Grotto of the Nativity: a low, cave-like chamber beneath the altar where a 14-pointed silver star set into the marble floor marks the traditional site of the birth of Jesus. The inscription on the star reads, in Latin: Hic de Virgine Maria Jesus Christus natus est — Here Jesus Christ was born of the Virgin Mary. The grotto is shared between the Greek Orthodox and Armenian churches; a separate cave nearby, the Grotto of the Manger, belongs to the Franciscan Custody of the Holy Land.`,
        ],
      },
      {
        heading: `Mount of Olives and Garden of Gethsemane`,
        paragraphs: [
          `Rising just east of the Old City of Jerusalem, the Mount of Olives offers the most iconic panoramic view of the holy city — the domes and minarets of the Temple Mount, the golden Dome of the Rock, and the ancient walls of the city stretching against the sky. The mount is mentioned repeatedly in the Gospels as a place Jesus frequented for prayer and teaching, and it is from here, according to Christian tradition, that he ascended to heaven after the Resurrection.`,
          `At the foot of the Mount of Olives lies the Garden of Gethsemane, where Jesus is said to have prayed on the night before his crucifixion. The garden is now maintained by the Franciscan Custody of the Holy Land and contains eight ancient olive trees believed to be among the oldest in the world — carbon dating suggests they may be over 900 years old. The Basilica of the Agony (Church of All Nations), built in 1924, stands adjacent to the garden and incorporates a section of bedrock identified by tradition as the Rock of Agony where Jesus knelt in prayer.`,
          `Both sites reward early morning visits when the crowds thin and the quality of light over the city is at its most extraordinary.`,
        ],
      },
      {
        heading: `Practical Information for Holy Land Pilgrims`,
        paragraphs: [
          `The sacred sites of the Holy Land are managed by a complex mix of Israeli, Palestinian, and denominational authorities. Entry requirements, dress codes, and photography rules vary by site — modest dress (covered shoulders and knees) is required at all churches and at the Western Wall. Guided tours are strongly recommended for first-time visitors; local Christian guides, many of them from communities with centuries of presence in the region, offer an irreplaceable depth of contextual knowledge.`,
          `SoulStep maps all the major pilgrimage sites of the Holy Land and integrates practical information — opening hours, entry fees, denominations present, and pilgrim reviews — into each site listing. The group journey feature is particularly useful for organised church pilgrimages, allowing group leaders to build a shared itinerary and track participation across the full journey.`,
        ],
      },
    ],
  },
  {
    slug: `sikh-gurdwaras-world`,
    title: `The Most Significant Sikh Gurdwaras in the World`,
    description: `A guide to the most revered Sikh gurdwaras — from the Golden Temple in Amritsar to the historic takhts that are the supreme seats of Sikh authority.`,
    publishedAt: `2026-04-14`,
    readingTime: 7,
    category: `Sikhism`,
    coverGradient: `from-yellow-400 to-orange-600`,
    content: [
      {
        paragraphs: [
          `Sikhism, the fifth-largest religion in the world with over 25 million adherents, places the gurdwara — literally gateway to the Guru — at the centre of its communal and spiritual life. Every gurdwara houses the Guru Granth Sahib, the eternal living scripture of Sikhism, which is treated with the reverence afforded to a living guru. The gurdwara is simultaneously a house of worship, a community hall, and a place of unconditional hospitality: no visitor, regardless of faith, caste, gender, or social status, is ever turned away from the langar (community kitchen) that every gurdwara maintains.`,
          `While there are tens of thousands of gurdwaras on every continent, a small number hold exceptional historical and spiritual significance. These are sites intimately connected with the lives of the Ten Gurus of Sikhism, with pivotal events in Sikh history, or with the highest institutional authority in the Sikh faith. For Sikh pilgrims, visiting the takhts (thrones) — the five seats of supreme Sikh religious authority — is a lifelong aspiration comparable to the Hajj for Muslims or a visit to Varanasi for Hindus.`,
        ],
      },
      {
        heading: `Harmandir Sahib (Golden Temple), Amritsar: The Seat of the Soul`,
        paragraphs: [
          `There is no more iconic image in Sikhism than the Harmandir Sahib — the Temple of God — rising from the centre of the sacred Amrit Sarovar (Pool of Nectar) in Amritsar, Punjab. The lower marble structure, surrounded by water on all sides, is surmounted by an upper sanctuary sheathed in 750 kg of pure gold, which gives the complex its popular name: the Golden Temple. Construction of the original structure was supervised by the fifth Guru, Guru Arjan Dev Ji, who completed it in 1604 and installed the first copy of the Guru Granth Sahib within it.`,
          `The Golden Temple receives over 100,000 visitors every day — more than the Taj Mahal — and operates 24 hours a day, 365 days a year. The langar here serves free meals to all visitors without distinction; the daily operation feeds upwards of 80,000 people, making it one of the largest free community kitchens in the world. Arriving in the pre-dawn hours, when the temple is lit with a golden glow against the dark sky and the recitation of the nitnem (daily prayers) drifts across the water, is among the most profoundly moving spiritual experiences available anywhere on earth.`,
        ],
      },
      {
        heading: `Takht Sri Patna Sahib: Birthplace of the Tenth Guru`,
        paragraphs: [
          `Patna Sahib, in the capital of Bihar, marks the birthplace of Guru Gobind Singh Ji, the tenth and final human Guru of Sikhism, who was born here in 1666. Takht Sri Harmandir Ji Patna Sahib — one of the five supreme Sikh takhts — occupies the site of the house where the Guru was born and spent his early childhood. The complex contains relics associated with the young Guru life, including a steel bow, iron quoits (chakrams), and a cradle said to have been used during his infancy.`,
          `Patna Sahib is particularly significant during Gurpurb (the observance of Guru Gobind Singh birth anniversary, known as Prakash Purab), when the city fills with pilgrims from across India and beyond and the gurdwara is illuminated with thousands of lights in celebration.`,
        ],
      },
      {
        heading: `Takht Hazur Sahib, Nanded: Where the Guru Departed`,
        paragraphs: [
          `Located in Nanded, Maharashtra, Takht Sachkhand Sri Hazur Abchalnagar Sahib marks the site where Guru Gobind Singh Ji concluded his earthly life in 1708. The Guru had travelled to Nanded and established a significant Sikh community there; the gurdwara complex that now surrounds his final resting place is one of the most elaborate in the world.`,
          `The inner sanctum contains relics of extraordinary importance to the Sikh faith: the Guru personal weapons, clothing, and writing instruments. Nanded is home to a substantial Sikh community — the descendants of Sikhs who accompanied Guru Gobind Singh — whose cultural presence gives the city a distinct Punjabi character despite its location deep in Maharashtra. The gurdwara operates round the clock and serves langar continuously.`,
        ],
      },
      {
        heading: `Gurdwara Bangla Sahib, New Delhi`,
        paragraphs: [
          `In the heart of New Delhi, a short walk from Connaught Place, Gurdwara Bangla Sahib is the most prominent Sikh place of worship in the capital. Associated with the eighth Guru, Guru Har Krishan Ji, who stayed here in 1664 and tended to victims of a smallpox and cholera epidemic, the sacred sarovar (water tank) is believed to have healing properties. The white and gold structure, crowned by a large gold dome, is visible for considerable distance and has become one of the most recognisable landmarks in Delhi.`,
          `Bangla Sahib is remarkable for its accessibility and its extraordinary langar: the kitchen serves roughly 40,000 free meals per day, run entirely by volunteers. The atmosphere is welcoming to visitors of all faiths; guided tours in multiple languages are available. For many international travellers visiting Delhi, it offers the most accessible introduction to Sikh faith, practice, and community.`,
          `SoulStep lists all five takhts and hundreds of significant gurdwaras worldwide, making it easy to plan a Sikh pilgrimage whether your journey takes you to Punjab, Bihar, Maharashtra, Delhi, or the many historic gurdwaras of the United Kingdom, Canada, and beyond.`,
        ],
      },
    ],
  },
];

export function getArticleBySlug(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}

export function getRelatedArticles(current: Article, count = 2): Article[] {
  const sameCat = articles.filter(
    (a) => a.slug !== current.slug && a.category === current.category,
  );
  const others = articles.filter((a) => a.slug !== current.slug && a.category !== current.category);
  return [...sameCat, ...others].slice(0, count);
}
