# How it works

1. **Collection.** Each source's front page, plus each topic's tag on Zenn, Qiita, dev.to and Lobsters. Some noise is dropped on the way in: dev.to's own community threads (challenges, chat, site news) and new repositories with no real description or the "pre-configured environment" wording of bought-star lures. GitHub release titles get the first point of their release notes.
2. **Popularity becomes a percentile.** Each raw score turns into "the share of this platform's stories from the last 14 days that scored lower". A story with 300 points on HN and one with 60 reactions on dev.to can now be compared fairly.
3. **Cross-posting bonus.** A story found on several platforms gets +0.05 per extra platform.
4. **Interest.** The highest weight among the topics it matches (0 if none). A story matches a topic through a keyword in its title or tags, or because a tag lookup found it; a front-page story's own tags don't count by themselves, since sites tag loosely.
5. **Sections.**
   - **Official:** new posts from the blogs and releases you follow.
   - **One per topic:** the stories whose heaviest matching topic is this one. Most popular first, where a story whose title doesn't name the topic (only a tag put it there) counts as 0.3 less popular. A topic with fewer stories than it shows also takes ones up to 14 days old. The rest wait behind "Show more".
   - **Elsewhere:** no topic match and popularity ≥ 0.9, most popular first.
   - **New repos:** repositories from the last 7 days gaining stars, your topics first.
6. **Variety.** No single platform fills more than 40% of a section, and no author on dev.to, Zenn, Qiita, Medium or note more than one story, while others have stories to offer.
7. **Freshness.** Platform stories older than 4 days are dropped. A story stays on the page the day it is first shown and the next day, then hides unless its popularity rises by 0.1 or more; then it comes back once, marked *Back again*.
8. **In the browser.** Stories you have read move after the unread ones in each section, so a second visit shows what is left. Coming back to the page never swaps the stories under you: a newer edition is offered in a message instead. A title in another language than the page gets a translated line under it when the browser can translate on the device (desktop Chrome and Edge); the first time, the browser downloads the language after your next tap or key press.

The 14-day score history and the list of shown stories are kept in the Actions cache between runs. Scores from tag lookups stay out of that history, so they don't make front-page stories look more popular than they are. Only today's `feed.json` is published.

## Privacy & etiquette

- **What gets published:** titles, links and popularity numbers. No article text is copied.
- **What stays on your device:** Read later, read marks and mutes live in your browser's `localStorage` and are never sent anywhere. Titles are translated by the browser itself, on your device; they aren't sent to a translation service.
- **No tracking:** the page loads nothing from third parties, and a strict Content Security Policy blocks inline scripts and outside requests.
- **Gentle fetching:** each run makes one pass over the sources. Requests to the same host go one at a time with a pause (5 seconds for Hatena, per its `robots.txt`). Every request carries a User-Agent naming your repository. Please keep the schedule to a couple of runs a day.
- **Terms of service:** this is meant as a personal reading page. If you build a public service on top of it, check each source's terms first.
