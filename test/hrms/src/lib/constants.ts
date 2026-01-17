export const GAME_INFO = {
  title: "Adventure Quest",
  tagline: "Embark on an Epic Journey",
  description: "Join millions of players in the most exciting cartoon adventure game. Explore magical worlds, battle fierce enemies, and collect legendary heroes in this action-packed RPG experience."
} as const;

export const FEATURES = [
  {
    name: "Epic Battles",
    description: "Engage in thrilling real-time combat with stunning visual effects and strategic gameplay.",
    iconName: "GiSwordman"
  },
  {
    name: "Collect Heroes",
    description: "Unlock and upgrade over 100 unique characters, each with special abilities and powers.",
    iconName: "FaUsers"
  },
  {
    name: "Explore Worlds",
    description: "Discover vast magical realms filled with secrets, treasures, and challenging quests.",
    iconName: "FaGlobeAmericas"
  },
  {
    name: "Multiplayer Mode",
    description: "Team up with friends or compete against players worldwide in exciting PvP battles.",
    iconName: "IoMdPeople"
  },
  {
    name: "Regular Updates",
    description: "Enjoy fresh content with new characters, events, and storylines added every month.",
    iconName: "FaCalendarAlt"
  },
  {
    name: "Cross-Platform",
    description: "Play seamlessly across mobile, tablet, and desktop with cloud save synchronization.",
    iconName: "FaMobileAlt"
  }
] as const;

export const CHARACTERS = [
  {
    name: "Luna Starlight",
    role: "Mystic Mage",
    description: "Master of celestial magic with the power to control stars and cosmic energy. Her spells can turn the tide of any battle.",
    imagePath: "/images/characters/luna.webp",
    stats: {
      power: 95,
      defense: 70,
      speed: 85
    }
  },
  {
    name: "Rex Ironheart",
    role: "Warrior Knight",
    description: "Fearless champion wielding legendary armor and an unbreakable sword. His courage inspires allies in the heat of combat.",
    imagePath: "/images/characters/rex.webp",
    stats: {
      power: 90,
      defense: 95,
      speed: 60
    }
  },
  {
    name: "Zara Swiftwind",
    role: "Shadow Assassin",
    description: "Lightning-fast rogue who strikes from the shadows. Her precision and agility make her a deadly force.",
    imagePath: "/images/characters/zara.webp",
    stats: {
      power: 85,
      defense: 65,
      speed: 98
    }
  },
  {
    name: "Finn Emberforge",
    role: "Fire Elementalist",
    description: "Harnesses the raw power of flames to devastate enemies. His fiery attacks leave nothing but ashes.",
    imagePath: "/images/characters/finn.webp",
    stats: {
      power: 92,
      defense: 68,
      speed: 75
    }
  }
] as const;

export const GALLERY = [
  {
    title: "Epic Boss Battle",
    description: "Face off against massive bosses in stunning environments with dynamic combat mechanics.",
    imagePath: "/images/gallery/boss-battle.webp"
  },
  {
    title: "Magical Forest Realm",
    description: "Explore enchanted forests filled with mystical creatures and hidden treasures.",
    imagePath: "/images/gallery/forest-realm.webp"
  },
  {
    title: "Hero Collection",
    description: "Build your ultimate team from a diverse roster of powerful heroes and champions.",
    imagePath: "/images/gallery/hero-collection.webp"
  },
  {
    title: "Multiplayer Arena",
    description: "Compete in intense PvP battles and climb the leaderboards to prove your skills.",
    imagePath: "/images/gallery/multiplayer-arena.webp"
  },
  {
    title: "Dragon's Lair",
    description: "Venture into dangerous dungeons and defeat legendary dragons for epic rewards.",
    imagePath: "/images/gallery/dragon-lair.webp"
  }
] as const;

export const SOCIAL_LINKS = [
  {
    name: "Twitter",
    url: "https://twitter.com/adventurequest",
    iconName: "FaTwitter"
  },
  {
    name: "Discord",
    url: "https://discord.gg/adventurequest",
    iconName: "FaDiscord"
  },
  {
    name: "Instagram",
    url: "https://instagram.com/adventurequest",
    iconName: "FaInstagram"
  },
  {
    name: "Facebook",
    url: "https://facebook.com/adventurequest",
    iconName: "FaFacebook"
  },
  {
    name: "YouTube",
    url: "https://youtube.com/adventurequest",
    iconName: "FaYoutube"
  },
  {
    name: "Reddit",
    url: "https://reddit.com/r/adventurequest",
    iconName: "FaReddit"
  }
] as const;

export const CTA_BUTTONS = {
  primary: "Play Now",
  secondary: "Download Game",
  newsletter: "Subscribe",
  learnMore: "Learn More"
} as const;

export const NAVIGATION_LINKS = [
  { name: "Home", href: "#home" },
  { name: "Features", href: "#features" },
  { name: "Gallery", href: "#gallery" },
  { name: "Characters", href: "#characters" },
  { name: "Download", href: "#download" }
] as const;

export const FOOTER_LINKS = {
  about: [
    { name: "About Us", href: "/about" },
    { name: "Careers", href: "/careers" },
    { name: "Press Kit", href: "/press" },
    { name: "Blog", href: "/blog" }
  ],
  support: [
    { name: "Help Center", href: "/help" },
    { name: "FAQ", href: "/faq" },
    { name: "Contact Us", href: "/contact" },
    { name: "Report Bug", href: "/report" }
  ],
  legal: [
    { name: "Privacy Policy", href: "/privacy" },
    { name: "Terms of Service", href: "/terms" },
    { name: "Cookie Policy", href: "/cookies" },
    { name: "EULA", href: "/eula" }
  ]
} as const;
