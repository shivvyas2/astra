# App Store listing: Astrya 1.0

What to paste into App Store Connect for `com.shivvyas.astra`. Subscriptions,
server notifications and the privacy URL are set up in
[GO_LIVE_CHECKLIST.md §6](GO_LIVE_CHECKLIST.md); this file covers the rest.
Every feature claim below is in the README or the code as of 23 Oct 2026.

## App Information

| Field | Value |
|---|---|
| Name (30) | `Astrya: Vedic Birth Chart` (25) |
| Subtitle (30) | `Kundli, dasha and AI readings` (29) |
| Primary category | Lifestyle |
| Secondary category | Entertainment |
| Content rights | No third-party content |
| Privacy Policy URL | `https://astra.shivvyas.com/privacy` |
| Languages | English, Hindi, Gujarati (the app and the site are both translated) |

## Promotional Text (170)

```
Your real birth chart, computed from the Swiss Ephemeris, read by an astrologer that remembers you. Now in English, Hindi and Gujarati.
```

## Description (4,000)

```
Astrya computes your real birth chart from your birth date, time and place, then reads it with you.

Nothing about your chart is guessed. Planetary positions, houses, nakshatras, dashas, doshas and transits are calculated with the Swiss Ephemeris. The AI astrologer only interprets those computed facts.

ASK ANYTHING
Chat with an astrologer that reads your own chart. Choose Vedic (sidereal, Lahiri), Western (tropical) or numerology for each conversation.

IT REMEMBERS YOU
Astrya keeps track of what you've told it about your life, a short note from each conversation, and the predictions it has made, so every reading stays consistent with the last. You can see all of it under What Astrya knows, mark predictions as happened or not, and delete anything.

YOUR KUNDLI
Your full Vedic chart as a diagram and a downloadable PDF, with grahas, nakshatras, dasha periods and numerology.

YOUR LIFE TIMELINE
Your Vimshottari dasha periods laid out as a map of your life, each with a plain-language meaning. Pin real moments to it, and add key dates from your chart to your calendar.

DAILY READINGS AND ALERTS
A morning and a night reading on your own clock, and a notification only when a dosha or a hard transit begins or ends.

SIRI AND WIDGETS
Ask Siri which dasha you're in or for today's reading. Home Screen widgets show today's reading and your current period.

IN YOUR LANGUAGE
The whole app is available in English, Hindi and Gujarati.

PRIVATE BY DESIGN
Before your first reading, Astrya shows you exactly what is sent to the AI and asks for your OK. No ads, no analytics, no tracking. Delete your account and everything in it from your profile at any time.

ASTRYA PLUS
Every reading is free. Astrya Plus is an optional subscription that supports the app and adds alternate app icons and a badge. Payment is charged to your Apple ID and renews automatically unless cancelled at least 24 hours before the end of the period. Manage or cancel in your App Store account settings.

Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy: https://astra.shivvyas.com/privacy

Astrya is for reflection and entertainment. It is not a substitute for medical, legal or financial advice.
```

## Keywords (100)

```
astrology,kundli,horoscope,jyotish,dasha,nakshatra,rashi,numerology,zodiac,dosha,janam,vedic
```

(96 characters.)

## URLs and version

| Field | Value |
|---|---|
| Support URL | `https://astra.shivvyas.com/support` **does not exist yet (404).** Add the page, or use `https://astra.shivvyas.com/privacy`, which has the contact address |
| Marketing URL | `https://astra.shivvyas.com` |
| Version | `1.0` |
| Copyright | `2026 Shiv Vyas` |
| Build | App Store Connect already has build 5. The next upload must be **6 or higher**: set `CFBundleVersion` in `mobile/project.yml` before archiving |

## App Privacy

No tracking. Everything below is **Linked to you**, purpose **App Functionality**:

- Contact Info → Email Address
- Identifiers → User ID
- Purchases → Purchase History (Plus status)
- User Content → Photos or Videos (profile photo, Supabase `avatars` bucket)
- User Content → Other User Content (birth details, chat messages, remembered facts, life moments, mood check-ins)
- Identifiers → Device ID (push token, when alerts are on)

Not collected: location (the birth place is typed in, not read from GPS), contacts, health, financial, browsing, diagnostics.

> **Third-party AI:** under the 2025 guideline 5.1.2(i), say plainly that birth
> details, chart, messages and remembered facts go to Anthropic, after the
> consent screen. The consent screen and the privacy page already say this.

## Age Rating

| Question | Answer |
|---|---|
| Violence, sexual content, profanity, horror, drugs, gambling | None |
| Medical or treatment information | None |
| User-generated content shared with others | No (chats are private between the user and the AI) |
| Messaging between users | No |
| Unrestricted web access | No |
| AI chatbot / generated content | Yes |
| Advertising | No |

Expected: **13+**.

## App Review Information

**Sign-in:** a password account made for review, `shivvyas0209+appreview@gmail.com`
(password kept out of the repo; reset it with the Supabase admin API if lost).
Its birth profile is filled in (Alex Reviewer, 15 Jun 1992, 09:30, Cupertino);
AI consent and Plus are left unset so the reviewer sees both flows.

**Notes**
```
Astrya computes a real birth chart (Swiss Ephemeris, server-side) and an AI model by Anthropic interprets only the computed values.

TO TRY IT: Tap Sign in and use the demo email and password above. The demo account already has a birth chart. To start fresh, sign up with any email and enter any birth date, time and city, agree to the AI consent screen, then ask a question in Chat.

AI DATA: Before the first reading the app shows exactly what is sent to Anthropic and asks for consent. It can be withdrawn in Profile (tap your photo) > Withdraw consent. Data is not used to train models.

ASTRYA PLUS: Optional subscription (You > Astrya Plus). It does not gate or limit any reading; it adds alternate app icons (You > App icon) and a badge.

FAIR USE: Readings are free for everyone, with a daily limit per account so the free service stays sustainable. The demo account is well within it.

ACCOUNT DELETION: Profile (tap your photo) > Delete my account.

Astrya is for reflection and entertainment and does not give medical, legal or financial advice.
```

**Release:** Manually release this version.

## Screenshots

iPhone 6.9" (1320 × 2868) or 6.3" (1206 × 2622), 3 to 10 images. The app is
iPhone only (`TARGETED_DEVICE_FAMILY: "1"`), so no iPad shots are needed. Suggested order:
Chat reading → Kundli → Life timeline → Today's reading → What Astrya knows →
widgets and Siri.
Plus needs one **review screenshot** of the paywall on each subscription.
