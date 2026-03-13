"""Profanity filter for the kiosk — triggers walkoff when bad words are detected.

This is for a children's museum exhibit, so the list is comprehensive.
"""

import re

# Core profanity terms and common letter-substitution variants
_PROFANITY_WORDS = {
    # Common profanity
    "fuck", "fucker", "fucking", "fucked", "fucks", "fuckoff", "fuckface",
    "motherfucker", "motherfucking", "motherfuck",
    "shit", "shitty", "shithead", "shitface", "bullshit", "horseshit",
    "damn", "dammit", "goddamn", "goddammit",
    "ass", "asshole", "asswipe", "badass", "dumbass", "jackass", "fatass",
    "bitch", "bitches", "bitching", "bitchy", "sonofabitch",
    "hell", "helluva",
    "crap", "crappy",
    "dick", "dickhead", "dickface",
    "cock", "cocksucker",
    "pussy", "pussies",
    "bastard", "bastards",
    "whore", "hoe", "slut", "slutty", "skank",
    "piss", "pissed", "pissoff",
    "tits", "titty", "boobs", "boob",
    "cunt", "cunts",
    "wanker", "wank",
    "twat", "twats",
    "arse", "arsehole",
    "bollocks",
    "bugger",
    "bloody",
    "blowjob",
    "handjob",

    # Slurs — racial, ethnic, homophobic, ableist
    "nigger", "nigga", "niggas", "negro",
    "spic", "spick", "wetback",
    "chink", "gook", "jap", "slant",
    "kike", "hebe",
    "fag", "faggot", "faggots", "faggy", "dyke",
    "retard", "retarded", "retards",
    "cripple",
    "tranny",
    "cracker", "honky",
    "beaner",
    "raghead", "towelhead", "sandnigger",
    "paki",
    "wop", "dago", "guido",
    "redneck", "hillbilly",

    # Sexually explicit
    "penis", "vagina", "dildo", "vibrator",
    "masturbate", "masturbating", "masturbation", "jerkoff",
    "orgasm", "cumming", "cum", "jizz", "semen", "ejaculate",
    "anal", "anus",
    "pornography", "porn", "porno",
    "rape", "raping", "rapist",
    "molest", "pedophile", "paedophile",
    "orgy", "threesome", "gangbang",
    "boner", "erection",
    "hooker", "prostitute",
    "stripper",
    "sexting",

    # Drug references (inappropriate for kids exhibit)
    "cocaine", "heroin", "meth", "methamphetamine",
    "crack", "weed", "marijuana", "stoner",
    "ecstasy", "molly", "lsd",

    # Violence-related
    "kill", "murder", "suicide",
    "terrorist", "terrorism",

    # Kid-specific variants and internet slang
    "stfu", "gtfo", "lmfao", "wtf", "omfg",
    "thot", "simp",
    "deez", "ligma", "sugma",
    "bruh",

    # Juvenile / bathroom / potty humor (kids museum context)
    "poop", "poopy", "poopoo", "poo", "poophead", "poopyhead", "poopface",
    "pee", "peepee", "peeing",
    "fart", "farting", "farted", "farts", "farty", "fartface",
    "butt", "butthead", "buttface", "butthole", "buttcrack", "buttcheek",
    "booger", "boogers", "boogerface",
    "weiner", "wiener", "weenie",
    "doodoo", "doody", "doodie",
    "turd", "turds", "turdface",
    "snot", "snotface", "snotnose",
    "barf", "barfface", "barfbag",
    "stupid", "stupidhead", "stupidface",
    "dumb", "dumbo", "dumbface", "dummy",
    "idiot", "idiots",
    "moron", "morons",
    "loser", "losers",
    "ugly", "uglyface",
    "stinky", "stinkface", "stinkbutt",
    "shut up", "shutup",
    "suck", "sucks", "sucker",
    "hate", "hateyou",
    "meanie", "meanface",
    "nerd", "dork", "doofus", "dweeb",
    "booty", "bootycheeks",
    "nuts", "nutsack", "ballsack", "balls",
    "caca", "peepeepoopoo",

    # Common letter substitutions (l33tspeak)
    "fuk", "fck", "fcuk", "phuck", "phuk",
    "sh1t", "sht", "b1tch", "btch",
    "d1ck", "a$$", "a55",
    "n1gger", "n1gga",
}

# Compile a regex pattern that matches whole words (case-insensitive)
_pattern = re.compile(
    r"\b(" + "|".join(re.escape(w) for w in sorted(_PROFANITY_WORDS, key=len, reverse=True)) + r")\b",
    re.IGNORECASE,
)


def contains_profanity(text: str) -> bool:
    """Return True if the text contains any profanity words."""
    return bool(_pattern.search(text))
