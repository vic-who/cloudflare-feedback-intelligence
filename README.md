# cloudflare-feedback-intelligence
While my repository may be lacking in the technical implementation of my prototype, I hope that the PRD I outlined below would provide more context and a better understanding of what I had in mind. This was based on competitive research of current market solutions, including Enterpret and Canny.


# Feedback Dashboard Product Requirement Document
**Context/Pain Points:** 
Cloudflare receives high-volume, multi-source feedback across support tickets, GitHub issues, community forums, Discord, email, and social channels. This feedback is fragmented, noisy, and difficult for Product Managers to synthesize into actionable insights.

**Goal:**
Provide a single, theme-centric dashboard that aggregates feedback, surfaces the most important user pain points, tracks trends over time, and enables fast action (e.g., Jira issue creation).

## Problem Statement
PMs need a way to:
- Aggregate product feedback across multiple fragmented channels
- Identify the most impactful user pain points across feedback sources
- Understand how feedback evolves over time 
- Quickly translate feedback into prioritized product actions

so that they can effectively prioritize and address user pain points

## Potential Solutions
- Consolidate feedback into mutually exclusive, actionable themes
- Rank and prioritize themes using clear, explainable metrics
- Enable fast drill-down from themes → raw feedback
- Support lightweight Jira workflows from insight → action (low priority)

## Key Concepts
**Feedback** - An individual piece of user input (ticket, GitHub issue, forum post, etc.), enriched with metadata:
- Source
- Sentiment
- Category (complaint, praise, improvement, help)
- User attributes (tier, company size, internal/external)
- Timestamp

**Theme** - A cluster of feedback representing a single underlying user issue or desire.<br>
Themes must be:
- Mutually exclusive (no double counting)
- Interpretable (human-readable, product-language following: User/Segment + Problem + Context)
- Concise (one core problem)
- Actionable (leads to a clear next step)
- Example: “Enterprise users experience frequent WAF false positives”

## Features
### Main Dashboard (Theme-Centric) - P0
1. Theme Trend Line Graph<br>
Purpose: Show how feedback volume evolves over time.<br>
X-axis: Time (day / week)<br>
Y-axis: Feedback volume<br>
Lines: Top 5 themes (by priority score)<br>
Interaction:
- Hover: volume + sentiment snapshot
- Click: navigate to theme detail view

2. Theme Ranking Bar Chart<br>
Purpose: Compare themes by impact at a glance.<br>
Horizontal bar chart ranked by priority score (showing only the top 10 themes)<br>
Each bar shows:
- Theme name
- Feedback count
- Sentiment indicator (color-coded)

Click → Theme detail view

3. Sentiment Overview<br>
Purpose: Understand overall emotional direction of feedback.<br>
Distribution of Positive / Neutral / Negative<br>
Filter-aware (updates based on active filters)<br>
Supports release impact analysis<br>

4. “Top User Pain Points” Section<br>
Purpose: Plain-language summary for fast executive comprehension.<br>
AI-generated summaries of the top prioritized themes<br>
Answers:“What are users struggling with most right now?”<br>

Note: Pain points are not separate entities—they are a summarized view of top themes to avoid duplication.

### Theme Prioritization & Ranking - P1
Themes are ranked using a composite prioritization score based on four factors:
- Volume (Number of feedback items in the theme)
- Sentiment Severity (weighing: negative > neutral > positive)
- User Impact (weighing: enterprise > paid > free)
  - Larger company size weighted higher
  - Internal feedback can be optionally excluded
- Trend/Velocity (sudden spikes in volume or increasing rate of change over time)

Themes are surfaced in priority bands:
- Critical
- High
- Medium
- Low

### Theme Detail View - P0
When a theme is selected, the detailed view shows:
- Theme Summary, an AI-generated description of the underlying issue
- Trend and sentiment snapshot
- Subthemes, smaller, coherent breakdowns if the theme is large
- Raw feedback items linking back to the original source
  - filterable and sortable by: source, user segment, timestamp
#### Theme Management - P2
A settings section where PMs can:
  - Rename themes
  - Merge related themes
  - Split overly broad themes
  - create, link, and assign jira issues

### Filters (Global) - P1
Filters apply across the dashboard and raw feedback with groupings:
- Source: Support, GitHub, Discord, Internal, etc.
- Content: Theme, category, sentiment
- User: Tier, company size, internal/external
- Timeframe: Presets (week, month, yr) + custom range

Active filters are always visible.

### Jira Workflow (MVP) - P2
**Entry point:** Theme detail view <br>
**Action:** “Create Jira Issue”

Auto-filled fields:
- Title: Theme name
- Description: the theme summary supplemented with user quotes
- Metadata: 
  - Feedback volume
  - Sentiment distribution
  - Affected product/feature area
  - User segments impacted

As a PM I can manually confirm priority, and assigns owner

## Success Metrics
- Reduction in time to identify top 3 pain points
- % of Critical/High themes linked to Jira
- PM's manual edits to themes (signal of trust & engagement)
- Qualitative PM feedback on clarity & trust
