'use client'

import { useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js'

interface NewtonsCradleProps {
  onScoreUpdate: (score: number) => void
  onComplete: (score: number) => void
}

interface Ball {
  mesh: THREE.Mesh
  string: THREE.Line
  angle: number
  angularVelocity: number
  pivotX: number
  pivotY: number
  pivotZ: number
  stringLength: number
  radius: number
  index: number
}

export default function NewtonsCradle({ onScoreUpdate, onComplete }: NewtonsCradleProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [interactions, setInteractions] = useState(0)
  const interactionsRef = useRef(0)

  useEffect(() => {
    if (!containerRef.current) return

    // Constants
    const BALL_RADIUS = 0.5
    const STRING_LENGTH = 4
    const NUM_BALLS = 5
    const GRAVITY = 9.8
    const DAMPING = 0.9995 // Very low damping for realistic swing
    const BALL_SPACING = BALL_RADIUS * 2.01 // Balls just touching

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xffffff)

    // Camera
    const camera = new THREE.PerspectiveCamera(
      50,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    )
    camera.position.set(0, 2, 12)
    camera.lookAt(0, 2, 0)

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.xr.enabled = true
    containerRef.current.appendChild(renderer.domElement)

    // VR Button
    const vrButton = VRButton.createButton(renderer)
    containerRef.current.appendChild(vrButton)

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(5, 10, 5)
    scene.add(directionalLight)

    // Support structure
    const supportGeometry = new THREE.BoxGeometry(6, 0.2, 0.2)
    const supportMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513 })
    const support = new THREE.Mesh(supportGeometry, supportMaterial)
    support.position.set(0, 5, 0)
    scene.add(support)

    // Calculate starting X position to center the balls
    const totalWidth = (NUM_BALLS - 1) * BALL_SPACING
    const startX = -totalWidth / 2

    // Create balls array
    const balls: Ball[] = []

    for (let i = 0; i < NUM_BALLS; i++) {
      const pivotX = startX + i * BALL_SPACING
      const pivotY = 5
      const pivotZ = 0

      // Create ball mesh
      const geometry = new THREE.SphereGeometry(BALL_RADIUS, 32, 32)
      const material = new THREE.MeshStandardMaterial({
        color: 0x708090,
        metalness: 0.7,
        roughness: 0.3,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.userData = { index: i }
      mesh.castShadow = true
      scene.add(mesh)

      // Create string
      const stringGeometry = new THREE.BufferGeometry()
      const stringMaterial = new THREE.LineBasicMaterial({
        color: 0x000000,
        linewidth: 2
      })
      const string = new THREE.Line(stringGeometry, stringMaterial)
      scene.add(string)

      // Initial angle - all at rest
      const initialAngle = 0

      balls.push({
        mesh,
        string,
        angle: initialAngle,
        angularVelocity: 0,
        pivotX,
        pivotY,
        pivotZ,
        stringLength: STRING_LENGTH,
        radius: BALL_RADIUS,
        index: i,
      })
    }

    // Update ball position based on angle
    function updateBallPosition(ball: Ball) {
      const x = ball.pivotX + ball.stringLength * Math.sin(ball.angle)
      const y = ball.pivotY - ball.stringLength * Math.cos(ball.angle)
      const z = ball.pivotZ

      ball.mesh.position.set(x, y, z)

      // Update string
      const points = [
        new THREE.Vector3(ball.pivotX, ball.pivotY, ball.pivotZ),
        new THREE.Vector3(x, y, z),
      ]
      ball.string.geometry.setFromPoints(points)
    }

    // Initialize all ball positions
    balls.forEach(updateBallPosition)

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.target.set(0, 2, 0)
    controls.update()

    // Raycaster for clicking
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    const onClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObjects(balls.map(b => b.mesh))

      if (intersects.length > 0) {
        const clickedMesh = intersects[0].object as THREE.Mesh
        const index = clickedMesh.userData.index

        // Only allow clicking end balls
        if (index === 0 || index === NUM_BALLS - 1) {
          const ball = balls[index]

          // Pull back the ball to 30 degrees
          ball.angle = index === 0 ? Math.PI / 6 : -Math.PI / 6
          ball.angularVelocity = 0
          updateBallPosition(ball)

          // Update score
          const newInteractions = interactionsRef.current + 1
          interactionsRef.current = newInteractions
          setInteractions(newInteractions)
          onScoreUpdate(newInteractions * 10)

          if (newInteractions >= 10) {
            setTimeout(() => onComplete(100), 1000)
          }
        }
      }
    }

    renderer.domElement.addEventListener('click', onClick)

    // Collision detection and response
    function handleCollisions() {
      for (let i = 0; i < balls.length - 1; i++) {
        const ball1 = balls[i]
        const ball2 = balls[i + 1]

        // Calculate distance between ball centers
        const dx = ball1.mesh.position.x - ball2.mesh.position.x
        const dy = ball1.mesh.position.y - ball2.mesh.position.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        // Check for collision
        const minDist = ball1.radius + ball2.radius

        if (distance < minDist) {
          // Calculate velocities in the x-direction (primary collision axis)
          const v1 = ball1.angularVelocity * ball1.stringLength * Math.cos(ball1.angle)
          const v2 = ball2.angularVelocity * ball2.stringLength * Math.cos(ball2.angle)

          // Only transfer if balls are approaching
          if ((v1 > v2 && dx > 0) || (v1 < v2 && dx < 0)) {
            // Perfect elastic collision - exchange velocities
            const temp = ball1.angularVelocity
            ball1.angularVelocity = ball2.angularVelocity
            ball2.angularVelocity = temp

            // Separate balls slightly to prevent sticking
            const overlap = minDist - distance
            const separationAngle = overlap * 0.05

            if (dx > 0) {
              ball1.angle += separationAngle
              ball2.angle -= separationAngle
            } else {
              ball1.angle -= separationAngle
              ball2.angle += separationAngle
            }
          }
        }
      }
    }

    // Animation loop
    const clock = new THREE.Clock()

    const animate = () => {
      const deltaTime = Math.min(clock.getDelta(), 0.1)

      // Physics update for each ball
      balls.forEach(ball => {
        // Pendulum physics: angular acceleration = -(g/L) * sin(angle)
        const angularAcceleration = -(GRAVITY / ball.stringLength) * Math.sin(ball.angle)

        // Update angular velocity
        ball.angularVelocity += angularAcceleration * deltaTime
        ball.angularVelocity *= DAMPING

        // Update angle
        ball.angle += ball.angularVelocity * deltaTime

        // Update visual position
        updateBallPosition(ball)

        // Color based on motion
        const speed = Math.abs(ball.angularVelocity)
        const material = ball.mesh.material as THREE.MeshStandardMaterial
        if (speed > 0.1) {
          material.color.setHex(0x3b82f6) // Blue when moving
        } else {
          material.color.setHex(0x708090) // Gray when still
        }
      })

      // Handle collisions
      handleCollisions()

      controls.update()
      renderer.render(scene, camera)
    }

    renderer.setAnimationLoop(animate)

    // Handle resize
    const onResize = () => {
      if (!containerRef.current) return
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    }
    window.addEventListener('resize', onResize)

    // Cleanup
    return () => {
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('click', onClick)
      renderer.setAnimationLoop(null)
      controls.dispose()
      renderer.dispose()

      balls.forEach(ball => {
        ball.mesh.geometry.dispose()
        ;(ball.mesh.material as THREE.Material).dispose()
        ball.string.geometry.dispose()
        ;(ball.string.material as THREE.Material).dispose()
      })

      if (containerRef.current) {
        const vrBtn = containerRef.current.querySelector('button')
        if (vrBtn) containerRef.current.removeChild(vrBtn)
        if (renderer.domElement && containerRef.current.contains(renderer.domElement)) {
          containerRef.current.removeChild(renderer.domElement)
        }
      }
    }
  }, [onScoreUpdate, onComplete])

  const resetSimulation = () => {
    interactionsRef.current = 0
    setInteractions(0)
    onScoreUpdate(0)
    // The balls will naturally come to rest
  }

  return (
    <div className="w-full h-[600px] relative">
      <div ref={containerRef} className="w-full h-full" />

      {/* Controls */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-lg p-4 border border-gray-300 shadow-lg">
        <div className="flex gap-4 items-center">
          <div className="text-gray-900 text-sm">
            <span className="text-gray-600">Interactions:</span>
            <span className="ml-2 font-bold">{interactions}/10</span>
          </div>
          <button
            onClick={resetSimulation}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-semibold transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-4 border border-gray-300 shadow-lg max-w-xs">
        <h3 className="text-gray-900 font-bold mb-2">Newton's Cradle</h3>
        <p className="text-gray-700 text-sm mb-2">
          Click the <strong>leftmost or rightmost ball</strong> to pull it back.
        </p>
        <p className="text-gray-600 text-xs">
          Watch conservation of momentum and energy in action!
        </p>
      </div>
    </div>
  )
}
