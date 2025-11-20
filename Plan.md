# EduPlay 3D - My Grades & AI Integration Plan

## Overview
This document outlines the implementation plan for adding comprehensive analytics (My Grades page) and AI-powered features to the EduPlay 3D educational platform.

---

## Phase 1: My Grades Analytics Page

### Create `/app/dashboard/my-grades/page.tsx`

#### Subject-wise Performance Section
**Layout:** Grid of 4 subject cards (Physics, Chemistry, Biology, Mathematics)

**Each Subject Card Displays:**
- Subject icon with color theme from database
- Total games played in that subject
- Average score across all games in subject
- Completion percentage (completed games / total games)
- Total time spent (formatted as hours:minutes)
- Strengths indicator: Games with score > 80%
- Needs Practice indicator: Games with score < 50%
- Quick link to browse more games in that subject

**Styling:**
- Glass morphism cards: `bg-white/5 backdrop-blur-sm rounded-xl border border-white/10`
- Subject-specific gradient accents using database color_theme
- Responsive grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6`

#### Learning Analytics Charts Section

**1. Score Trends Over Time (Line Chart)**
- X-axis: Last 30 days
- Y-axis: Average score
- Multiple lines for each subject (color-coded)
- Tooltips showing exact scores and dates
- Shows learning progression over time

**2. Subject Distribution (Donut Chart)**
- Shows time spent percentage per subject
- Color-coded by subject theme
- Center shows total hours played
- Interactive hover effects

**3. Performance by Difficulty (Bar Chart)**
- X-axis: Easy, Medium, Hard
- Y-axis: Average score
- Grouped bars by subject
- Shows which difficulty levels need work

**4. Weekly Activity (Bar Chart)**
- X-axis: Last 7 days (Mon-Sun)
- Y-axis: Number of games played
- Stacked bars by subject
- Encourages consistent practice

#### AI Performance Analysis Panel
- Prominent card at top of page
- "AI Insights" heading with sparkle icon ✨
- 3-5 bullet points of AI-generated insights:
  - Subject-specific strengths
  - Areas needing improvement
  - Personalized game recommendations
  - Estimated practice time for mastery
- "Regenerate Analysis" button
- "Ask AI Tutor" button → links to AI Tutor page
- Last updated timestamp

#### Data Fetching Strategy
```typescript
// Fetch from Supabase:
// 1. All student_progress records for current user
// 2. Join with games, subjects, grades tables
// 3. Aggregate in frontend:
//    - Group by subject_id
//    - Calculate averages, sums, percentages
//    - Format for chart data structures
```

---

## Phase 2: AI Integration with Replicate

### Dependencies to Install
```bash
npm install replicate recharts lucide-react react-hot-toast
```

### Environment Variables
```env
# .env.local
REPLICATE_API_TOKEN=r8_xxxxxxxxxxxxx
NEXT_PUBLIC_REPLICATE_MODEL=meta/llama-2-70b-chat
```

### Create `/lib/replicate/client.ts`

**Replicate Helper Functions:**
```typescript
// initReplicate() - Initialize Replicate client with API key
// chat(messages, studentContext) - Send chat with context
// analyzePerformance(studentData) - Generate performance analysis
// generateGameFeedback(gameData) - Generate post-game feedback
// generateHints(gameId, attempts, score) - Context-aware hints
```

**System Prompts:**
```typescript
const TUTOR_SYSTEM_PROMPT = `
You are an enthusiastic and supportive AI tutor helping high school students
(grades 9-12) learn science through interactive 3D games. You specialize in
Physics, Chemistry, Biology, and Mathematics.

Guidelines:
- Keep explanations clear and age-appropriate
- Use analogies and real-world examples
- Encourage students and celebrate progress
- Break down complex topics into digestible chunks
- Reference specific games when helpful
`

const ANALYSIS_SYSTEM_PROMPT = `
You are an educational analytics AI analyzing student performance in
science games. Provide constructive, encouraging feedback.
`
```

### Create `/app/api/ai/chat/route.ts`

**Next.js API Route (Server-side):**
```typescript
// POST /api/ai/chat
// Body: { messages: ChatMessage[], studentContext: StudentContext }
// Response: { message: string, error?: string }

// Steps:
// 1. Authenticate user (check auth headers)
// 2. Fetch student data from Supabase
// 3. Build context (grade, subjects, recent scores)
// 4. Call Replicate API with system prompt + context
// 5. Return AI response
// 6. Log conversation to database
```

**Rate Limiting:**
- Max 20 requests per student per hour
- Store in-memory cache or use Vercel KV

**Error Handling:**
- Catch Replicate API errors
- Fallback messages if AI unavailable
- Timeout after 30 seconds

### Create `/app/api/ai/analyze/route.ts`

**Performance Analysis Endpoint:**
```typescript
// POST /api/ai/analyze
// Body: { studentId: string, subjects?: string[] }
// Response: { insights: string[], recommendations: string[] }

// Steps:
// 1. Fetch all student_progress data
// 2. Calculate analytics (avg scores, completion rates, etc.)
// 3. Format data for AI prompt
// 4. Call Replicate with analysis prompt
// 5. Parse AI response into structured insights
// 6. Cache result for 1 hour
```

### Create `/app/api/ai/feedback/route.ts`

**Post-Game Feedback Endpoint:**
```typescript
// POST /api/ai/feedback
// Body: { gameId: number, score: number, attempts: number, timeSpent: number }
// Response: { feedback: string, tips: string[], relatedConcepts: string[] }

// Game-specific prompts based on gameId
```

---

## Phase 3: AI Tutor Chat Page

### Create `/app/dashboard/ai-tutor/page.tsx`

#### Chat Interface Components

**Layout:**
```
┌─────────────────────────────────────┐
│  AI Tutor Header                    │
│  "Ask me anything about science!"   │
├─────────────────────────────────────┤
│                                     │
│  Chat Messages Area (scrollable)    │
│  - Student messages (right, cyan)   │
│  - AI messages (left, gray)         │
│  - Timestamps                       │
│  - Loading animation                │
│                                     │
├─────────────────────────────────────┤
│  Quick Question Chips               │
│  [Projectile Motion] [Molecules]... │
├─────────────────────────────────────┤
│  Input Field + Send Button          │
└─────────────────────────────────────┘
```

**Features:**
- Message history (stored in component state)
- Auto-scroll to latest message
- Loading dots animation while AI responds
- Quick question chips for common topics:
  - "Explain projectile motion"
  - "What is molecular geometry?"
  - "Help me improve my Physics score"
  - "What should I study next?"
- Markdown rendering for AI responses (bold, lists, code blocks)
- Error handling with toast notifications

**Student Context Sent to AI:**
```typescript
{
  grade: 9,
  currentSubject: "Physics",
  recentGames: [
    { title: "Projectile Motion", score: 80, attempts: 3 }
  ],
  strengths: ["Chemistry"],
  weaknesses: ["Physics"]
}
```

#### Update Sidebar Navigation
Add new menu item:
```typescript
{
  name: 'AI Tutor',
  href: '/dashboard/ai-tutor',
  icon: '🤖' // or use lucide-react Bot icon
}
```

---

## Phase 4: Dashboard AI Insights

### Enhance `/app/dashboard/page.tsx`

**Add AI Insights Card** (after welcome section, before grade selection)

```tsx
<div className="bg-gradient-to-br from-purple-600 to-indigo-800 rounded-xl p-6 shadow-lg border border-purple-400/20">
  <div className="flex items-center gap-3 mb-4">
    <Sparkles className="w-6 h-6 text-yellow-300" />
    <h2 className="text-2xl font-bold text-white">AI Insights</h2>
  </div>

  <div className="space-y-3">
    {insights.map(insight => (
      <div className="flex items-start gap-2">
        <div className="w-2 h-2 bg-yellow-300 rounded-full mt-2" />
        <p className="text-white/90">{insight}</p>
      </div>
    ))}
  </div>

  <div className="flex gap-3 mt-4">
    <button>View Full Analysis</button>
    <button>Ask AI Tutor</button>
  </div>
</div>
```

**Insights Generation:**
- Triggered on page load
- Call `/api/ai/analyze` endpoint
- Cache for 1 hour
- Regenerate after completing games
- Show 2-3 most relevant insights

**Example Insights:**
- "Great progress in Chemistry! You've completed 3/4 molecule games with an average score of 92%."
- "Your projectile motion scores are improving. Try the advanced physics games in Grade 10."
- "You're spending most time on Physics. Consider exploring Biology games to balance your learning."

---

## Phase 5: Enhanced My Grades Page with AI

### Add to `/app/dashboard/my-grades/page.tsx`

**AI Analysis Section** (top of page, above charts)

```tsx
<div className="bg-gradient-to-br from-blue-600 to-cyan-700 rounded-xl p-8 shadow-lg mb-8">
  <h2>AI Performance Analysis</h2>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
    <div>
      <h3>Strengths</h3>
      <ul>{strengths.map(...)}</ul>
    </div>

    <div>
      <h3>Areas for Improvement</h3>
      <ul>{improvements.map(...)}</ul>
    </div>
  </div>

  <div className="mt-6">
    <h3>Recommended Next Steps</h3>
    <ul>{recommendations.map(...)}</ul>
  </div>

  <button onClick={regenerateAnalysis}>🔄 Regenerate Analysis</button>
  <span className="text-sm">Last updated: {timestamp}</span>
</div>
```

**AI Analysis Content:**
- Detailed breakdown per subject
- Comparison to estimated difficulty levels
- Time management insights (too fast? too slow?)
- Personalized learning path suggestions
- Specific games to replay or try next

---

## Phase 6: Post-Game AI Review

### Create `components/ai/PostGameReview.tsx`

**Modal Component:**
```tsx
<Modal isOpen={isOpen} onClose={onClose}>
  <div className="bg-gray-900 rounded-2xl p-8 max-w-2xl">
    <h2>Game Complete! 🎉</h2>

    <div className="grid grid-cols-3 gap-4 my-6">
      <StatCard label="Score" value={score} />
      <StatCard label="Attempts" value={attempts} />
      <StatCard label="Time" value={formatTime(time)} />
    </div>

    <div className="bg-white/5 rounded-xl p-6">
      <h3>AI Feedback</h3>
      <p>{aiFeedback}</p>
    </div>

    {score < 100 && (
      <div className="bg-yellow-500/10 rounded-xl p-4 mt-4">
        <h4>Tips for Improvement</h4>
        <ul>{tips.map(...)}</ul>
      </div>
    )}

    <div className="mt-6">
      <h4>Related Concepts to Explore</h4>
      <div className="flex gap-2">
        {relatedConcepts.map(concept => (
          <span className="px-3 py-1 bg-cyan-500/20 rounded-full">
            {concept}
          </span>
        ))}
      </div>
    </div>

    <div className="flex gap-3 mt-6">
      <button onClick={onClose}>Close</button>
      <button onClick={openAITutor}>Ask AI a Question</button>
    </div>
  </div>
</Modal>
```

**Integration:**
- Modify `GameContainer.tsx` to show modal after `onComplete`
- Call `/api/ai/feedback` with game data
- Show loading state while AI generates feedback
- Cache feedback to avoid re-generating on modal re-open

---

## Phase 7: Database Schema Updates

### New Tables

#### `ai_conversations`
```sql
CREATE TABLE IF NOT EXISTS public.ai_conversations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    messages JSONB NOT NULL, -- Array of {role, content, timestamp}
    context JSONB, -- Student context at time of conversation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX idx_ai_conversations_student ON ai_conversations(student_id);
```

#### `ai_insights`
```sql
CREATE TABLE IF NOT EXISTS public.ai_insights (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    insight_type TEXT NOT NULL, -- 'performance_analysis', 'recommendation', 'game_feedback'
    subject_id INTEGER REFERENCES public.subjects(id), -- nullable
    game_id INTEGER REFERENCES public.games(id), -- nullable
    content TEXT NOT NULL, -- AI-generated text
    metadata JSONB, -- Supporting data (scores, timestamps, etc.)
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX idx_ai_insights_student ON ai_insights(student_id);
CREATE INDEX idx_ai_insights_type ON ai_insights(insight_type);
```

### Analytics Views

#### Subject Performance View
```sql
CREATE OR REPLACE VIEW student_subject_performance AS
SELECT
    sp.student_id,
    s.name as subject_name,
    s.color_theme,
    COUNT(DISTINCT sp.game_id) as games_played,
    SUM(CASE WHEN sp.completed THEN 1 ELSE 0 END) as games_completed,
    AVG(sp.score) as avg_score,
    SUM(sp.time_spent) as total_time,
    SUM(sp.attempts) as total_attempts
FROM student_progress sp
JOIN games g ON sp.game_id = g.id
JOIN subjects s ON g.subject_id = s.id
GROUP BY sp.student_id, s.id, s.name, s.color_theme;
```

#### Weekly Activity View
```sql
CREATE OR REPLACE VIEW student_weekly_activity AS
SELECT
    sp.student_id,
    DATE_TRUNC('day', sp.last_played_at) as play_date,
    COUNT(DISTINCT sp.game_id) as games_played,
    SUM(sp.attempts) as total_attempts
FROM student_progress sp
WHERE sp.last_played_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY sp.student_id, DATE_TRUNC('day', sp.last_played_at);
```

### RLS Policies
```sql
-- Students can view their own AI data
CREATE POLICY "Users can view own conversations" ON public.ai_conversations
    FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "Users can insert own conversations" ON public.ai_conversations
    FOR INSERT WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Users can view own insights" ON public.ai_insights
    FOR SELECT USING (auth.uid() = student_id);
```

---

## Phase 8: Replicate AI Integration

### Replicate Setup

**API Authentication:**
- Sign up at replicate.com
- Get API token from account settings
- Add to `.env.local`

**Model Selection:**
- **Primary:** `meta/llama-2-70b-chat` (intelligent, accurate)
- **Fallback:** `meta/llama-2-13b-chat` (faster, cheaper)
- **Alternative:** `mistralai/mistral-7b-instruct-v0.2`

**Pricing (Replicate):**
- Llama 2 70B: ~$0.0007 per request
- Pay only for what you use
- No infrastructure management

### API Routes

#### `/app/api/ai/chat/route.ts`
```typescript
import Replicate from 'replicate'

export async function POST(request: Request) {
  const { messages, studentContext } = await request.json()

  // Authenticate user
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Initialize Replicate
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  })

  // Build prompt with context
  const systemPrompt = TUTOR_SYSTEM_PROMPT
  const contextPrompt = buildContextPrompt(studentContext)

  // Call Replicate
  const output = await replicate.run(
    "meta/llama-2-70b-chat",
    {
      input: {
        prompt: `${systemPrompt}\n\n${contextPrompt}\n\n${formatMessages(messages)}`,
        max_new_tokens: 500,
        temperature: 0.7,
      }
    }
  )

  // Save to database
  await saveConversation(session.user.id, messages, output)

  return Response.json({ message: output })
}
```

#### `/app/api/ai/analyze/route.ts`
```typescript
export async function POST(request: Request) {
  // Fetch student performance data
  // Build analysis prompt with data
  // Call Replicate for insights
  // Parse and structure response
  // Cache for 1 hour
  // Return insights
}
```

#### `/app/api/ai/feedback/route.ts`
```typescript
export async function POST(request: Request) {
  // Get game details and performance
  // Build game-specific prompt
  // Call Replicate
  // Return structured feedback
}
```

### Helper Functions (`/lib/replicate/helpers.ts`)

```typescript
// buildContextPrompt(studentContext) - Format context for AI
// formatMessages(messages) - Convert to Replicate format
// parseAIResponse(response) - Extract structured data
// cacheInsight(studentId, insight) - Store in database
// rateLimitCheck(studentId) - Prevent abuse
```

---

## Phase 9: UI Components

### Chart Components (`/components/charts/`)

#### `ScoreTrendChart.tsx`
```typescript
// Recharts LineChart wrapper
// Props: data (array of {date, score, subject})
// Responsive container
// Custom tooltip
// Color-coded lines per subject
```

#### `SubjectDistributionChart.tsx`
```typescript
// Recharts PieChart/DonutChart
// Props: data (array of {subject, timeSpent, color})
// Center label showing total
// Interactive legend
```

#### `PerformanceBarChart.tsx`
```typescript
// Recharts BarChart
// Props: data (grouped by difficulty)
// Grouped bars by subject
// Custom colors from subject themes
```

#### `WeeklyActivityChart.tsx`
```typescript
// Recharts BarChart
// Props: data (last 7 days activity)
// Stacked bars by subject
// Date labels on x-axis
```

### AI Components (`/components/ai/`)

#### `PostGameReview.tsx`
- Modal overlay with backdrop
- Game stats display
- AI feedback section
- Tips list
- Related concepts chips
- CTA buttons

#### `AIInsightCard.tsx`
```typescript
// Reusable card for displaying single AI insight
// Props: insight (text), type (success/warning/info), subject
// Icon based on type
// Gradient background based on subject color
```

#### `ChatMessage.tsx`
```typescript
// Single chat bubble
// Props: message, role (student/ai), timestamp
// Different styling for student vs AI
// Markdown support for AI messages
```

#### `ChatInput.tsx`
```typescript
// Text input with send button
// Character limit (500 chars)
// Disabled while loading
// Enter to send (Shift+Enter for new line)
// Auto-focus on mount
```

---

## Implementation Timeline

### Week 1: Foundation
- [ ] Install dependencies (replicate, recharts, lucide-react, react-hot-toast)
- [ ] Set up Replicate account and get API key
- [ ] Create database tables (ai_conversations, ai_insights)
- [ ] Create analytics views in Supabase
- [ ] Build chart components (ScoreTrendChart, SubjectDistributionChart, etc.)

### Week 2: My Grades Page
- [ ] Create `/app/dashboard/my-grades/page.tsx`
- [ ] Implement subject performance cards
- [ ] Integrate all 4 chart components
- [ ] Fetch and aggregate data from Supabase
- [ ] Add loading states and error handling
- [ ] Test responsive design

### Week 3: Replicate Integration
- [ ] Create `/lib/replicate/client.ts` with helper functions
- [ ] Build `/app/api/ai/chat/route.ts`
- [ ] Build `/app/api/ai/analyze/route.ts`
- [ ] Build `/app/api/ai/feedback/route.ts`
- [ ] Implement rate limiting
- [ ] Test API routes with Postman/curl

### Week 4: AI Tutor Page
- [ ] Create `/app/dashboard/ai-tutor/page.tsx`
- [ ] Build ChatMessage, ChatInput components
- [ ] Implement message history state management
- [ ] Connect to `/api/ai/chat` endpoint
- [ ] Add quick question chips
- [ ] Add loading states and error handling
- [ ] Update sidebar navigation

### Week 5: Dashboard AI Insights
- [ ] Create AIInsightCard component
- [ ] Add AI Insights section to main dashboard
- [ ] Implement auto-generation on login
- [ ] Add regenerate functionality
- [ ] Add "View Full Analysis" link to My Grades page
- [ ] Integrate AI analysis panel on My Grades page

### Week 6: Post-Game Review
- [ ] Create PostGameReview modal component
- [ ] Integrate into GameContainer
- [ ] Connect to `/api/ai/feedback` endpoint
- [ ] Test with both games (Projectile Motion, Molecule Builder)
- [ ] Add "Ask AI" navigation from modal
- [ ] Polish animations and transitions

### Week 7: Testing & Polish
- [ ] End-to-end testing of all AI features
- [ ] Performance optimization (caching, lazy loading)
- [ ] Error handling edge cases
- [ ] Accessibility improvements
- [ ] Mobile responsive testing
- [ ] Documentation updates

---

## Technical Considerations

### Replicate vs Ollama Comparison

| Feature | Replicate (Cloud) | Ollama (Local) |
|---------|------------------|----------------|
| Setup | API key only | Install Ollama + models |
| Cost | ~$0.0007/request | Free (after hardware) |
| Latency | 2-5 seconds | 0.5-2 seconds |
| Scaling | Automatic | Limited by hardware |
| Maintenance | None | Update models manually |
| Deployment | Works on Vercel | Needs dedicated server |

**Recommendation:** Replicate for cloud deployment simplicity.

### Performance Optimization

**Caching Strategy:**
- AI insights: Cache for 1 hour per student
- Performance analysis: Cache until new game completed
- Chat responses: No caching (conversational)
- Post-game feedback: Cache per game attempt

**Loading States:**
- Skeleton loaders for charts
- Typing animation for AI responses
- Progressive loading for My Grades page

### Security Considerations

**API Key Security:**
- Store REPLICATE_API_TOKEN in environment variables (server-side only)
- Never expose in client-side code
- Use Next.js API routes as proxy

**Rate Limiting:**
- 20 AI requests per student per hour
- 100 chart data fetches per student per hour
- Prevent spam/abuse

**Input Validation:**
- Sanitize student questions before sending to AI
- Limit message length (500 chars)
- Filter inappropriate content

### Supabase Queries

**Optimized Queries for Analytics:**
```typescript
// Fetch all data needed for My Grades page in one query
const { data } = await supabase
  .from('student_progress')
  .select(`
    *,
    games (
      title,
      difficulty_level,
      subject_id,
      subjects (name, color_theme),
      grade_id,
      grades (grade_number)
    )
  `)
  .eq('student_id', userId)
  .order('last_played_at', { ascending: false })
```

---

## File Structure (Complete)

```
C:\Dev\Repo\3DWebsite/
├── app/
│   ├── dashboard/
│   │   ├── page.tsx                    # [MODIFY] Add AI Insights card
│   │   ├── my-grades/
│   │   │   └── page.tsx                # [CREATE] Analytics page with charts + AI analysis
│   │   ├── ai-tutor/
│   │   │   └── page.tsx                # [CREATE] Chat interface
│   │   └── progress/
│   │       └── page.tsx                # [EXISTS] Current progress page
│   └── api/
│       └── ai/
│           ├── chat/
│           │   └── route.ts            # [CREATE] Chat endpoint
│           ├── analyze/
│           │   └── route.ts            # [CREATE] Analysis endpoint
│           └── feedback/
│               └── route.ts            # [CREATE] Feedback endpoint
│
├── components/
│   ├── charts/
│   │   ├── ScoreTrendChart.tsx         # [CREATE]
│   │   ├── SubjectDistributionChart.tsx # [CREATE]
│   │   ├── PerformanceBarChart.tsx     # [CREATE]
│   │   └── WeeklyActivityChart.tsx     # [CREATE]
│   ├── ai/
│   │   ├── PostGameReview.tsx          # [CREATE] Modal component
│   │   ├── AIInsightCard.tsx           # [CREATE] Reusable insight card
│   │   ├── ChatMessage.tsx             # [CREATE] Chat bubble
│   │   └── ChatInput.tsx               # [CREATE] Input field
│   ├── games/
│   │   └── GameContainer.tsx           # [MODIFY] Add PostGameReview
│   └── navigation/
│       └── Sidebar.tsx                 # [MODIFY] Add AI Tutor link, update My Grades link
│
├── lib/
│   ├── replicate/
│   │   ├── client.ts                   # [CREATE] Replicate helpers
│   │   ├── prompts.ts                  # [CREATE] System prompts
│   │   └── helpers.ts                  # [CREATE] Utility functions
│   └── supabase/
│       └── analytics.ts                # [CREATE] Analytics query functions
│
├── supabase-schema.sql                 # [MODIFY] Add AI tables and views
├── package.json                        # [MODIFY] Add dependencies
└── .env.local.example                  # [MODIFY] Add REPLICATE_API_TOKEN
```

---

## Dependencies to Install

```json
{
  "dependencies": {
    "replicate": "^0.25.0",
    "recharts": "^2.10.0",
    "lucide-react": "^0.300.0",
    "react-hot-toast": "^2.4.1",
    "react-markdown": "^9.0.0",
    "remark-gfm": "^4.0.0"
  },
  "devDependencies": {
    "@types/react-markdown": "^7.0.0"
  }
}
```

**Purpose:**
- `replicate` - Replicate API client
- `recharts` - Chart library for analytics
- `lucide-react` - Modern icon library
- `react-hot-toast` - Toast notifications for AI responses
- `react-markdown` + `remark-gfm` - Render AI markdown responses (bold, lists, etc.)

---

## Key Features Summary

### My Grades Page
✅ Subject-wise performance cards with detailed metrics
✅ 4 interactive charts (trends, distribution, difficulty, activity)
✅ AI-generated performance analysis panel
✅ Strengths and weaknesses breakdown
✅ Personalized recommendations

### AI Tutor Page
✅ Chat interface with conversation history
✅ Quick question chips for common topics
✅ Context-aware responses (knows student's performance)
✅ Markdown-formatted explanations
✅ Real-time streaming responses

### Dashboard AI Insights
✅ 2-3 key insights on main dashboard
✅ Auto-generated on login
✅ Updates after completing games
✅ Links to full analysis and AI Tutor

### Post-Game Review
✅ Modal appears after game completion
✅ Shows score, attempts, time
✅ AI-generated personalized feedback
✅ Tips for improvement
✅ Related concepts to explore
✅ Direct link to ask AI questions

---

## User Experience Flows

### Flow 1: Student Checks Progress
1. Student logs in → Dashboard
2. Sees "AI Insights" card with 2-3 recommendations
3. Clicks "View Full Analysis"
4. Lands on My Grades page
5. Sees subject performance cards + charts
6. Reads detailed AI analysis with strengths/weaknesses
7. Clicks recommended game to practice

### Flow 2: Student Gets Stuck on Concept
1. Student playing Projectile Motion game
2. Struggling with angle calculations
3. Clicks "AI Tutor" in sidebar (or from dashboard)
4. Types: "I don't understand how angle affects distance"
5. AI responds with explanation + projectile motion equations
6. Student asks follow-up question
7. AI provides more detail with examples
8. Student returns to game with better understanding

### Flow 3: Student Completes Game
1. Student finishes Projectile Motion (score: 80/100)
2. PostGameReview modal appears
3. Shows stats: 80 points, 3 attempts, 5 minutes
4. AI feedback: "Good job! You mastered basic trajectories. To improve, try varying your launch angles more."
5. Tips: "For longer distances, use 45° angle for maximum range"
6. Related concepts: "Conservation of Energy", "Kinematic Equations"
7. Student clicks "Ask AI a Question" → AI Tutor opens

### Flow 4: Student Reviews Overall Performance
1. Student clicks "My Grades" in sidebar
2. Page loads with subject cards:
   - Physics: 3 games, 75% avg, 2h spent - "Needs Practice"
   - Chemistry: 2 games, 95% avg, 1h spent - "Strength"
3. Charts show:
   - Score trending upward over last week
   - Most time in Physics (60%), Chemistry (40%)
   - Weak on Hard difficulty (50% avg)
4. AI Analysis panel says:
   - "Your Chemistry understanding is excellent!"
   - "Physics scores improving - keep practicing"
   - "Try Grade 10 advanced physics games next"
5. Student clicks "Ask AI Tutor" to ask about specific physics concepts

---

## Success Metrics

**Analytics Features:**
- Students can view performance across all subjects
- Visual charts show learning trends
- Easy identification of strengths/weaknesses

**AI Features:**
- Students get personalized learning recommendations
- AI tutor answers subject questions accurately
- Post-game feedback helps students improve
- Engagement increases with AI insights

**Technical Goals:**
- Page load time < 2 seconds
- AI response time < 5 seconds
- Chart rendering smooth on mobile
- Zero AI hallucinations about student data (use facts only)

---

## Future Enhancements (Post-MVP)

- AI-generated practice problems
- Voice input for AI tutor (speech-to-text)
- Peer comparison (anonymized rankings)
- Parent/teacher dashboard
- AI-curated learning paths
- Achievements/badges system
- Multiplayer competitive games with AI matchmaking
- Export progress reports as PDF

---

## Notes

- All AI features are **optional** - app works without them
- Graceful degradation if Replicate API is down
- Student data privacy: No sharing with third parties
- AI responses are educational only, not graded/official
- Clear disclaimer: "AI tutor is a learning aid, not a replacement for teachers"

---

**End of Plan**