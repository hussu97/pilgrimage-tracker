---
name: App design prompt for Stitch
overview: A single, copy-paste-ready design prompt for Google Stitch that describes all app screens and flows for the pilgrimage/religious-places tracker, including your specified features plus essential related screens (auth, profile, settings, search, groups, sharing).
todos: []
isProject: false
---

# App design prompt for Google Stitch

Use the prompt below as-is in Google Stitch to generate app screens. It covers your described journey plus supporting flows (login, profile, settings, search, favorites, groups, sharing).

---

## Prompt to paste into Google Stitch

**App name:** Pilgrimage Tracker (or Religious Places Explorer)

**App type:** Mobile-first (iOS and Android); consider responsive or tablet variants if needed.

**Target users:** People who follow Islam, Hinduism, or Christianity and want to discover, visit, and track religious places (mosques, temples, churches, shrines, etc.).

**Design style:** Clean, inclusive, and respectful. Use a neutral palette with optional subtle religion-specific accents. Support both light and dark themes. Ensure good contrast and readability for all ages.

---

### 1. Onboarding and authentication

- **Splash / welcome screen:** App logo, short tagline, and primary CTA (e.g. "Get started" or "Sign in").
- **Registration screen:** Email, password, confirm password, optional name/phone. Clear validation messages and privacy/terms link.
- **Login screen:** Email and password, "Forgot password?" link, option to continue with Google/Apple if applicable.
- **Forgot password screen:** Email input and "Send reset link" button; success/error states.
- **Religion selection screen (onboarding):** Shown after first registration. Single choice: Islam, Hinduism, or Christianity. Optional "Skip for now" if you allow later selection. Clear cards or list with short description per religion.
- **Onboarding completion:** Short confirmation (e.g. "You're all set") and button to go to the main app (home).

---

### 2. Home and discovery

- **Homepage:** Top section with greeting and user's chosen religion. Main content: list of religious places relevant to that religion, **sorted by distance/proximity** to the user. Include:
  - Toggle or tab for **List view** vs **Map view**.
  - Optional search bar and filters (e.g. type of place, distance radius).
- **List view:** Scrollable list of place cards. Each card: place name, type (e.g. mosque, temple, church), distance, thumbnail image, optional short rating or "Visited" badge if user has checked in.
- **Map view:** Map with pins for religious places; pins styled by type or religion. Tapping a pin shows a small preview (name, distance); tap to go to place detail.
- **Search / filter screen (optional):** Search by name or location; filters: religion, place type, distance, open now, rating. Results in list or map.

---

### 3. Place details

- **Place detail screen:**  
  - Hero image and name.  
  - **Opening timings** (e.g. today's hours, full weekly schedule).  
  - **Ratings and reviews:** Average rating, review count, and list of reviews (with user name, date, rating, text). Option to "Write a review."  
  - **Religion-specific specifications:**  
    - Hinduism: e.g. main deities/gods, festival days, type of temple.  
    - Islam: e.g. prayer times, capacity, facilities (ablution, etc.).  
    - Christianity: e.g. denomination, mass/service times, notable features.  
  - **Actions:** "Check-in here," "Add to favorites," "Share," "Get directions."  
  - Optional: photo gallery, address, contact, accessibility info.

---

### 4. Check-in and profile

- **Check-in flow:** From place detail, user taps "Check-in." Optional: confirmation modal or success screen ("You've checked in at [Place name]"). Option to add a short note or photo.
- **User profile screen:**  
  - Avatar, name, email (or editable display name).  
  - **Stats:** e.g. "X religious sites visited," "Y check-ins this year," or a simple list of visited places.  
  - Sections: "My check-ins" or "Visited places," "Favorites," "My groups," "Reviews I wrote."  
  - Edit profile, settings, logout.
- **Edit profile screen:** Photo, display name, religion (changeable), optional bio. Save/cancel.

---

### 5. Groups and social

- **Groups list screen:** "My groups" with list of groups user belongs to. Each row: group name, member count, optional last activity. FAB or button "Create group."
- **Create group screen:** Group name, optional description, invite by link or by email/phone. Optional: set group as private.
- **Group detail screen:**  
  - Group name and description.  
  - **Progress comparison:** List of members with count of places visited (e.g. "Ahmed – 12 places," "Sara – 8 places"). Optional leaderboard or progress bars.  
  - List of places visited by the group (or by each member).  
  - Invite more members, leave group, group settings (if admin).
- **Invite to group flow:** Share invite link or send invites via app; pending invites and "Join group" acceptance screen for invitees.

---

### 6. Supporting screens and features

- **Favorites / saved places:** Dedicated screen listing places user saved; same card style as list view with remove option.
- **Settings screen:** Notifications (check-in reminders, group updates), privacy (who can see my check-ins, profile visibility), language, theme (light/dark/system), units (km/miles), about and terms, delete account.
- **Notifications screen:** List of notifications (e.g. "X invited you to group," "Y checked in at Z," "New review on a place you visited").
- **Write review screen:** Rating (e.g. stars), optional title, review text, optional photos. Submit and success state.
- **Share flows:** Share place (deep link or message), share check-in, share group invite link. Optional in-app share sheet.
- **Empty states:** No places nearby, no check-ins yet, no groups, no favorites—with clear CTAs (e.g. "Explore places," "Create a group").
- **Error states:** No network, failed to load places, failed to check-in—with retry and helpful message.

---

### 7. Navigation and flow summary

- **Bottom navigation (main):** Home, Map (or combined Home with list/map toggle), Favorites, Groups, Profile.  
- **Flow summary:**  
  - New user: Splash → Register → Religion selection → Home.  
  - Returning user: Splash → Login → Home.  
  - From Home: switch List/Map → tap place → Place detail → Check-in / Review / Favorites / Share.  
  - Profile: view stats and visited places → Edit profile or Settings.  
  - Groups: Groups list → Create or open group → see progress and invite members.

---

### 8. Additional notes for design

- Ensure religion selection and religion-specific fields feel neutral and accurate (consider copy or consultation for traditions).
- Make check-in and "places visited" count prominent on profile to support motivation.
- Make group progress easy to scan (e.g. counts, simple leaderboard, or map of visited places).
- Consider accessibility: touch targets, labels, and contrast for all screens.
- Consider a "Trip" or "Plan visit" flow later: select multiple places and see route or itinerary (optional for v1).

---

You can paste the entire prompt above into Google Stitch. If Stitch has a character limit, use sections 1–5 first (core journey), then add 6–8 (supporting screens and notes). Adjust app name or religion options to match your exact product.
