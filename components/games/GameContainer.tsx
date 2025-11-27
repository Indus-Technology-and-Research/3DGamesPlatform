'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'

// Dynamically import games to avoid SSR issues with Three.js
const MoleculeBuilder = dynamic(() => import('./MoleculeBuilder'), { ssr: false })
const ProjectileMotion = dynamic(() => import('./ProjectileMotion'), { ssr: false })
const BacteriaHunter = dynamic(() => import('./BacteriaHunter'), { ssr: false })

interface GameContainerProps {
  gameId: number
  gameTitle: string
  userId: string
}

export default function GameContainer({ gameId, gameTitle, userId }: GameContainerProps) {
  const [score, setScore] = useState(0)
  const [isCompleted, setIsCompleted] = useState(false)
  const [startTime] = useState(Date.now())
  const supabase = createClient()

  const saveProgress = async (finalScore: number, completed: boolean) => {
    const timeSpent = Math.floor((Date.now() - startTime) / 1000)

    try {
      // Check if progress exists
      const { data: existing } = await supabase
        .from('student_progress')
        .select('*')
        .eq('student_id', userId)
        .eq('game_id', gameId)
        .single()

      if (existing) {
        // Update existing progress
        await supabase
          .from('student_progress')
          .update({
            score: Math.max(existing.score || 0, finalScore),
            completed: completed || existing.completed,
            time_spent: (existing.time_spent || 0) + timeSpent,
            attempts: (existing.attempts || 0) + 1,
            last_played_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
      } else {
        // Insert new progress
        await supabase
          .from('student_progress')
          .insert({
            student_id: userId,
            game_id: gameId,
            score: finalScore,
            completed,
            time_spent: timeSpent,
            attempts: 1,
          })
      }
    } catch (error) {
      console.error('Error saving progress:', error)
    }
  }

  const handleScoreUpdate = (newScore: number) => {
    setScore(newScore)
  }

  const handleComplete = async (finalScore: number) => {
    setIsCompleted(true)
    setScore(finalScore)
    await saveProgress(finalScore, true)
  }

  // Auto-save progress periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (score > 0) {
        saveProgress(score, isCompleted)
      }
    }, 30000) // Save every 30 seconds

    return () => clearInterval(interval)
  }, [score, isCompleted])

  // Render the appropriate game based on gameId
  const renderGame = () => {
    switch (gameId) {
      case 2:
        return <MoleculeBuilder onScoreUpdate={handleScoreUpdate} onComplete={handleComplete} />
      case 3:
        return <ProjectileMotion onScoreUpdate={handleScoreUpdate} onComplete={handleComplete} />
      case 4:
        return <BacteriaHunter onScoreUpdate={handleScoreUpdate} onComplete={handleComplete} />
      default:
        return (
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-12 border border-white/10 text-center">
            <div className="text-6xl mb-4">🚧</div>
            <h3 className="text-xl font-bold text-white mb-2">Game Coming Soon</h3>
            <p className="text-gray-400">This game is under development. Check back later!</p>
          </div>
        )
    }
  }

  return (
    <div className="space-y-4">
      {/* Score Display */}
      <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm">Current Score</p>
          <p className="text-2xl font-bold text-white">{score}</p>
        </div>
        {isCompleted && (
          <div className="px-4 py-2 bg-green-500 rounded-lg font-semibold text-white">
            ✓ Completed!
          </div>
        )}
      </div>

      {/* Game Rendering Area */}
      <div className="bg-black rounded-xl overflow-hidden border border-white/10">
        {renderGame()}
      </div>
    </div>
  )
}
