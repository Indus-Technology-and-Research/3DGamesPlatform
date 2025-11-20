import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ScoreTrendChart from '@/components/charts/ScoreTrendChart'
import SubjectDistributionChart from '@/components/charts/SubjectDistributionChart'
import PerformanceBarChart from '@/components/charts/PerformanceBarChart'
import WeeklyActivityChart from '@/components/charts/WeeklyActivityChart'
import { TrendingUp, Award, Clock, Target } from 'lucide-react'

export default async function MyGradesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch student data
  const { data: student } = await supabase
    .from('students')
    .select('*')
    .eq('id', user.id)
    .single()

  // Fetch all progress with game details
  const { data: progressData } = await supabase
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
    .eq('student_id', user.id)
    .order('last_played_at', { ascending: false })

  // Calculate subject-wise performance
  const subjectStats: Record<string, any> = {}

  progressData?.forEach((progress: any) => {
    const subject = progress.games.subjects.name
    const color = progress.games.subjects.color_theme

    if (!subjectStats[subject]) {
      subjectStats[subject] = {
        name: subject,
        color: color,
        gamesPlayed: 0,
        gamesCompleted: 0,
        totalScore: 0,
        totalTime: 0,
        totalAttempts: 0,
        scores: [],
        highScores: 0,
        lowScores: 0
      }
    }

    subjectStats[subject].gamesPlayed++
    if (progress.completed) subjectStats[subject].gamesCompleted++
    subjectStats[subject].totalScore += progress.score || 0
    subjectStats[subject].totalTime += progress.time_spent || 0
    subjectStats[subject].totalAttempts += progress.attempts || 0
    subjectStats[subject].scores.push(progress.score || 0)

    if ((progress.score || 0) > 80) subjectStats[subject].highScores++
    if ((progress.score || 0) < 50) subjectStats[subject].lowScores++
  })

  // Calculate averages
  Object.values(subjectStats).forEach((stats: any) => {
    stats.avgScore = stats.gamesPlayed > 0 ? stats.totalScore / stats.gamesPlayed : 0
    stats.completionRate = stats.gamesPlayed > 0 ? (stats.gamesCompleted / stats.gamesPlayed) * 100 : 0
    stats.totalTimeFormatted = formatTime(stats.totalTime)
  })

  // Prepare chart data
  const subjects = Object.values(subjectStats) as any[]

  // Score trends (last 7 days)
  const scoreTrendData = generateScoreTrendData(progressData || [])

  // Subject distribution (time spent)
  const distributionData = subjects.map(s => ({
    name: s.name,
    value: s.totalTime / 3600, // Convert to hours
    color: s.color
  }))

  // Performance by difficulty
  const performanceData = generatePerformanceByDifficulty(progressData || [])

  // Weekly activity
  const weeklyData = generateWeeklyActivity(progressData || [])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-white mb-2">My Grades</h1>
        <p className="text-gray-400">Track your learning progress across all subjects</p>
      </div>

      {/* Subject Performance Cards */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-4">Subject Performance</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {subjects.map(subject => (
            <div
              key={subject.name}
              className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">{subject.name}</h3>
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: subject.color }}
                />
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Average Score</p>
                  <p className="text-2xl font-bold" style={{ color: subject.color }}>
                    {subject.avgScore.toFixed(0)}%
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-400">Games Played</p>
                    <p className="text-lg font-semibold text-white">{subject.gamesPlayed}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Completed</p>
                    <p className="text-lg font-semibold text-white">{subject.gamesCompleted}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-400">Time Spent</p>
                  <p className="text-sm font-semibold text-white">{subject.totalTimeFormatted}</p>
                </div>

                <div className="pt-3 border-t border-white/10">
                  {subject.highScores > 0 && (
                    <div className="flex items-center gap-2 text-green-400 text-sm">
                      <Award className="w-4 h-4" />
                      <span>{subject.highScores} high score{subject.highScores > 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {subject.lowScores > 0 && (
                    <div className="flex items-center gap-2 text-yellow-400 text-sm mt-1">
                      <Target className="w-4 h-4" />
                      <span>{subject.lowScores} need{subject.lowScores === 1 ? 's' : ''} practice</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Analytics Charts */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-4">Learning Analytics</h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Score Trends */}
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-bold text-white">Score Trends</h3>
            </div>
            <ScoreTrendChart
              data={scoreTrendData}
              subjects={subjects.map(s => ({ name: s.name, color: s.color }))}
            />
          </div>

          {/* Subject Distribution */}
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-purple-400" />
              <h3 className="text-lg font-bold text-white">Time Distribution</h3>
            </div>
            <SubjectDistributionChart data={distributionData} />
          </div>

          {/* Performance by Difficulty */}
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-green-400" />
              <h3 className="text-lg font-bold text-white">Performance by Difficulty</h3>
            </div>
            <PerformanceBarChart
              data={performanceData}
              subjects={subjects.map(s => ({ name: s.name, color: s.color }))}
            />
          </div>

          {/* Weekly Activity */}
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
            <div className="flex items-center gap-2 mb-4">
              <Award className="w-5 h-5 text-yellow-400" />
              <h3 className="text-lg font-bold text-white">Weekly Activity</h3>
            </div>
            <WeeklyActivityChart
              data={weeklyData}
              subjects={subjects.map(s => ({ name: s.name, color: s.color }))}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper functions
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

function generateScoreTrendData(progressData: any[]) {
  if (!progressData || progressData.length === 0) return []

  // Group by date and subject
  const dateMap: Record<string, any> = {}
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - i))
    return date.toISOString().split('T')[0]
  })

  last7Days.forEach(date => {
    dateMap[date] = { date: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }) }
  })

  progressData.forEach((progress: any) => {
    const date = new Date(progress.last_played_at).toISOString().split('T')[0]
    if (dateMap[date]) {
      const subject = progress.games.subjects.name
      if (!dateMap[date][subject]) {
        dateMap[date][subject] = []
      }
      dateMap[date][subject].push(progress.score || 0)
    }
  })

  // Calculate averages
  return Object.values(dateMap).map((day: any) => {
    const result: any = { date: day.date }
    Object.keys(day).forEach(key => {
      if (key !== 'date' && Array.isArray(day[key])) {
        result[key] = day[key].reduce((a: number, b: number) => a + b, 0) / day[key].length
      }
    })
    return result
  })
}

function generatePerformanceByDifficulty(progressData: any[]) {
  if (!progressData || progressData.length === 0) {
    return [
      { difficulty: 'Easy' },
      { difficulty: 'Medium' },
      { difficulty: 'Hard' }
    ]
  }

  const difficultyMap: Record<string, any> = {
    'easy': { difficulty: 'Easy' },
    'medium': { difficulty: 'Medium' },
    'hard': { difficulty: 'Hard' }
  }

  progressData.forEach((progress: any) => {
    const difficulty = progress.games.difficulty_level || 'medium'
    const subject = progress.games.subjects.name

    if (!difficultyMap[difficulty][subject]) {
      difficultyMap[difficulty][subject] = []
    }
    difficultyMap[difficulty][subject].push(progress.score || 0)
  })

  // Calculate averages
  return Object.values(difficultyMap).map((diff: any) => {
    const result: any = { difficulty: diff.difficulty }
    Object.keys(diff).forEach(key => {
      if (key !== 'difficulty' && Array.isArray(diff[key])) {
        result[key] = diff[key].reduce((a: number, b: number) => a + b, 0) / diff[key].length
      }
    })
    return result
  })
}

function generateWeeklyActivity(progressData: any[]) {
  if (!progressData || progressData.length === 0) return []

  const dayMap: Record<string, any> = {}
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - i))
    return date.toISOString().split('T')[0]
  })

  last7Days.forEach(date => {
    dayMap[date] = {
      day: new Date(date).toLocaleDateString('en-US', { weekday: 'short' })
    }
  })

  progressData.forEach((progress: any) => {
    const date = new Date(progress.last_played_at).toISOString().split('T')[0]
    if (dayMap[date]) {
      const subject = progress.games.subjects.name
      if (!dayMap[date][subject]) {
        dayMap[date][subject] = 0
      }
      dayMap[date][subject]++
    }
  })

  return Object.values(dayMap)
}
