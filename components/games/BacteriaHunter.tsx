'use client'

import { useRef, useState, useEffect } from 'react'
import * as THREE from 'three'

interface BacteriaHunterProps {
  onScoreUpdate: (score: number) => void
  onComplete: (score: number) => void
}

// Bacteria type definitions
interface BacteriaType {
  name: string
  color: number
  speed: number
  health: number
  points: number
  behavior: 'wander' | 'chase'
  fact: string
  scale: number
}

const BACTERIA_TYPES: Record<string, BacteriaType> = {
  ecoli: {
    name: 'E. coli',
    color: 0x88ff88,
    speed: 2,
    health: 1,
    points: 10,
    behavior: 'wander',
    fact: 'E. coli normally lives harmlessly in your intestines!',
    scale: 0.4
  },
  streptococcus: {
    name: 'Streptococcus',
    color: 0xff88ff,
    speed: 3,
    health: 2,
    points: 25,
    behavior: 'chase',
    fact: 'Streptococcus forms chains and can cause strep throat!',
    scale: 0.35
  }
}

interface Bacteria {
  mesh: THREE.Group
  type: BacteriaType
  health: number
  velocity: THREE.Vector3
  targetPosition: THREE.Vector3 | null
  wanderTimer: number
}

interface Projectile {
  mesh: THREE.Mesh
  direction: THREE.Vector3
  speed: number
  createdAt: number
}

interface Room {
  position: THREE.Vector3
  size: { width: number; height: number; depth: number }
  hasBacteria: boolean
}

export default function BacteriaHunter({ onScoreUpdate, onComplete }: BacteriaHunterProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const clockRef = useRef(new THREE.Clock())
  const keysRef = useRef<Set<string>>(new Set())
  const bacteriaRef = useRef<Bacteria[]>([])
  const projectilesRef = useRef<Projectile[]>([])
  const isPointerLockedRef = useRef(false)
  const playerPositionRef = useRef(new THREE.Vector3(0, 1.6, 0))

  const [score, setScore] = useState(0)
  const [bacteriaKilled, setBacteriaKilled] = useState(0)
  const [totalBacteria, setTotalBacteria] = useState(0)
  const [currentFact, setCurrentFact] = useState<string | null>(null)
  const [isPointerLocked, setIsPointerLocked] = useState(false)
  const [gameComplete, setGameComplete] = useState(false)

  // Show educational fact popup
  const showFact = (fact: string) => {
    setCurrentFact(fact)
    setTimeout(() => setCurrentFact(null), 3500)
  }

  useEffect(() => {
    if (!containerRef.current) return

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x220000) // Dark red bloodstream
    scene.fog = new THREE.FogExp2(0x330000, 0.025) // Atmospheric fog
    sceneRef.current = scene

    // Camera (First Person)
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      100
    )
    camera.position.set(0, 1.6, 0)
    camera.rotation.order = 'YXZ'
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xff6666, 0.4)
    scene.add(ambientLight)

    const pointLight = new THREE.PointLight(0xff4444, 1, 30)
    pointLight.position.set(0, 5, 0)
    scene.add(pointLight)

    // Player light (follows camera)
    const playerLight = new THREE.PointLight(0xffffff, 0.5, 15)
    camera.add(playerLight)
    scene.add(camera)

    // Generate procedural level
    const rooms = generateLevel()
    createLevelGeometry(scene, rooms)

    // Spawn bacteria in rooms
    let bacteriaCount = 0
    rooms.forEach((room, index) => {
      if (room.hasBacteria) {
        const count = spawnBacteriaInRoom(scene, room, index)
        bacteriaCount += count
      }
    })
    setTotalBacteria(bacteriaCount)

    // Pointer lock handlers
    const handlePointerLockChange = () => {
      const locked = document.pointerLockElement === containerRef.current
      isPointerLockedRef.current = locked
      setIsPointerLocked(locked)
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isPointerLockedRef.current || !cameraRef.current) return

      const sensitivity = 0.002
      cameraRef.current.rotation.y -= e.movementX * sensitivity
      cameraRef.current.rotation.x -= e.movementY * sensitivity

      // Clamp vertical rotation
      cameraRef.current.rotation.x = Math.max(
        -Math.PI / 2 + 0.1,
        Math.min(Math.PI / 2 - 0.1, cameraRef.current.rotation.x)
      )
    }

    const handleClick = () => {
      if (!isPointerLockedRef.current) {
        containerRef.current?.requestPointerLock()
      } else {
        // Shoot!
        shoot()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.code.toLowerCase())
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code.toLowerCase())
    }

    // Event listeners
    document.addEventListener('pointerlockchange', handlePointerLockChange)
    document.addEventListener('mousemove', handleMouseMove)
    containerRef.current.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)

    // Shooting function
    function shoot() {
      if (!cameraRef.current || !sceneRef.current) return

      const direction = new THREE.Vector3(0, 0, -1)
      direction.applyQuaternion(cameraRef.current.quaternion)

      // Create projectile mesh (antibody)
      const geometry = new THREE.SphereGeometry(0.08, 8, 8)
      const material = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x00ffff,
        emissiveIntensity: 0.8
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.copy(cameraRef.current.position)
      sceneRef.current.add(mesh)

      projectilesRef.current.push({
        mesh,
        direction: direction.clone(),
        speed: 25,
        createdAt: Date.now()
      })
    }

    // Generate level rooms
    function generateLevel(): Room[] {
      const rooms: Room[] = []

      // Spawn room (center, no bacteria)
      rooms.push({
        position: new THREE.Vector3(0, 0, 0),
        size: { width: 12, height: 6, depth: 12 },
        hasBacteria: false
      })

      // Generate connected rooms
      const directions = [
        new THREE.Vector3(0, 0, -20),  // Forward
        new THREE.Vector3(20, 0, 0),   // Right
        new THREE.Vector3(-20, 0, 0),  // Left
        new THREE.Vector3(0, 0, -40),  // Far forward
      ]

      directions.forEach((dir, i) => {
        rooms.push({
          position: dir.clone(),
          size: {
            width: 10 + Math.random() * 6,
            height: 5 + Math.random() * 3,
            depth: 10 + Math.random() * 6
          },
          hasBacteria: true
        })
      })

      return rooms
    }

    // Create visual geometry for level
    function createLevelGeometry(scene: THREE.Scene, rooms: Room[]) {
      const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0xaa3333,
        roughness: 0.9,
        metalness: 0.1,
        side: THREE.BackSide
      })

      const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x661111,
        roughness: 0.95,
        metalness: 0.05
      })

      const tunnelMaterial = new THREE.MeshStandardMaterial({
        color: 0x882222,
        roughness: 0.85,
        side: THREE.BackSide
      })

      rooms.forEach((room, index) => {
        // Create room as hollow box
        const { width, height, depth } = room.size

        // Floor
        const floorGeom = new THREE.PlaneGeometry(width, depth)
        const floor = new THREE.Mesh(floorGeom, floorMaterial)
        floor.rotation.x = -Math.PI / 2
        floor.position.copy(room.position)
        floor.receiveShadow = true
        scene.add(floor)

        // Ceiling
        const ceilingGeom = new THREE.PlaneGeometry(width, depth)
        const ceiling = new THREE.Mesh(ceilingGeom, wallMaterial.clone())
        ceiling.material.side = THREE.FrontSide
        ceiling.rotation.x = Math.PI / 2
        ceiling.position.copy(room.position)
        ceiling.position.y = height
        scene.add(ceiling)

        // Walls
        // Front wall
        const frontWallGeom = new THREE.PlaneGeometry(width, height)
        const frontWall = new THREE.Mesh(frontWallGeom, wallMaterial.clone())
        frontWall.material.side = THREE.FrontSide
        frontWall.position.copy(room.position)
        frontWall.position.z -= depth / 2
        frontWall.position.y = height / 2
        scene.add(frontWall)

        // Back wall
        const backWallGeom = new THREE.PlaneGeometry(width, height)
        const backWall = new THREE.Mesh(backWallGeom, wallMaterial.clone())
        backWall.material.side = THREE.FrontSide
        backWall.rotation.y = Math.PI
        backWall.position.copy(room.position)
        backWall.position.z += depth / 2
        backWall.position.y = height / 2
        scene.add(backWall)

        // Left wall
        const leftWallGeom = new THREE.PlaneGeometry(depth, height)
        const leftWall = new THREE.Mesh(leftWallGeom, wallMaterial.clone())
        leftWall.material.side = THREE.FrontSide
        leftWall.rotation.y = Math.PI / 2
        leftWall.position.copy(room.position)
        leftWall.position.x -= width / 2
        leftWall.position.y = height / 2
        scene.add(leftWall)

        // Right wall
        const rightWallGeom = new THREE.PlaneGeometry(depth, height)
        const rightWall = new THREE.Mesh(rightWallGeom, wallMaterial.clone())
        rightWall.material.side = THREE.FrontSide
        rightWall.rotation.y = -Math.PI / 2
        rightWall.position.copy(room.position)
        rightWall.position.x += width / 2
        rightWall.position.y = height / 2
        scene.add(rightWall)

        // Create tunnels connecting to spawn room (index 0)
        if (index > 0) {
          const startPos = new THREE.Vector3(0, 1.5, 0)
          const endPos = room.position.clone()
          endPos.y = 1.5

          const tunnelLength = startPos.distanceTo(endPos) - 8 // Subtract room overlap
          const tunnelRadius = 2

          const tunnelGeom = new THREE.CylinderGeometry(tunnelRadius, tunnelRadius, tunnelLength, 16, 1, true)
          const tunnel = new THREE.Mesh(tunnelGeom, tunnelMaterial)

          // Position tunnel between rooms
          const midPoint = startPos.clone().add(endPos).multiplyScalar(0.5)
          tunnel.position.copy(midPoint)

          // Rotate tunnel to connect rooms
          const direction = endPos.clone().sub(startPos).normalize()
          tunnel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)

          scene.add(tunnel)
        }
      })

      // Add some floating red blood cells for atmosphere
      for (let i = 0; i < 30; i++) {
        const rbcGeom = new THREE.TorusGeometry(0.3, 0.15, 8, 16)
        const rbcMat = new THREE.MeshStandardMaterial({
          color: 0xcc2222,
          roughness: 0.7,
          transparent: true,
          opacity: 0.6
        })
        const rbc = new THREE.Mesh(rbcGeom, rbcMat)

        // Random position in level area
        rbc.position.set(
          (Math.random() - 0.5) * 50,
          1 + Math.random() * 4,
          (Math.random() - 0.5) * 50
        )
        rbc.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)

        // Store for animation
        rbc.userData.rotationSpeed = {
          x: (Math.random() - 0.5) * 0.5,
          y: (Math.random() - 0.5) * 0.5,
          z: (Math.random() - 0.5) * 0.5
        }

        scene.add(rbc)
      }
    }

    // Spawn bacteria in a room
    function spawnBacteriaInRoom(scene: THREE.Scene, room: Room, roomIndex: number): number {
      const bacteriaCount = 3 + Math.floor(Math.random() * 3) // 3-5 per room
      const types = Object.keys(BACTERIA_TYPES)

      for (let i = 0; i < bacteriaCount; i++) {
        const typeKey = types[Math.floor(Math.random() * types.length)]
        const type = BACTERIA_TYPES[typeKey]

        // Create bacteria mesh group
        const group = new THREE.Group()

        if (typeKey === 'ecoli') {
          // Rod-shaped (capsule-like)
          const bodyGeom = new THREE.CapsuleGeometry(0.15, 0.4, 4, 8)
          const bodyMat = new THREE.MeshStandardMaterial({
            color: type.color,
            roughness: 0.6,
            emissive: type.color,
            emissiveIntensity: 0.2
          })
          const body = new THREE.Mesh(bodyGeom, bodyMat)
          body.rotation.z = Math.PI / 2
          group.add(body)

          // Add flagella (thin tails)
          for (let f = 0; f < 3; f++) {
            const flagellaGeom = new THREE.CylinderGeometry(0.02, 0.01, 0.5, 4)
            const flagellaMat = new THREE.MeshStandardMaterial({ color: 0x66aa66 })
            const flagella = new THREE.Mesh(flagellaGeom, flagellaMat)
            flagella.position.set(-0.35, 0, (f - 1) * 0.1)
            flagella.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.3
            group.add(flagella)
          }
        } else {
          // Streptococcus - chain of spheres
          const chainLength = 4 + Math.floor(Math.random() * 3)
          for (let c = 0; c < chainLength; c++) {
            const sphereGeom = new THREE.SphereGeometry(0.1, 8, 8)
            const sphereMat = new THREE.MeshStandardMaterial({
              color: type.color,
              roughness: 0.5,
              emissive: type.color,
              emissiveIntensity: 0.15
            })
            const sphere = new THREE.Mesh(sphereGeom, sphereMat)
            sphere.position.set(c * 0.18 - (chainLength * 0.18) / 2, 0, 0)
            group.add(sphere)
          }
        }

        // Random position in room
        const spawnPos = room.position.clone()
        spawnPos.x += (Math.random() - 0.5) * (room.size.width - 2)
        spawnPos.y = 1 + Math.random() * 2
        spawnPos.z += (Math.random() - 0.5) * (room.size.depth - 2)

        group.position.copy(spawnPos)
        group.scale.setScalar(type.scale)
        scene.add(group)

        bacteriaRef.current.push({
          mesh: group,
          type,
          health: type.health,
          velocity: new THREE.Vector3(),
          targetPosition: null,
          wanderTimer: Math.random() * 2
        })
      }

      return bacteriaCount
    }

    // Update player movement
    function updatePlayer(deltaTime: number) {
      if (!cameraRef.current || !isPointerLockedRef.current) return

      const moveSpeed = 5
      const moveVector = new THREE.Vector3()

      if (keysRef.current.has('keyw') || keysRef.current.has('arrowup')) moveVector.z -= 1
      if (keysRef.current.has('keys') || keysRef.current.has('arrowdown')) moveVector.z += 1
      if (keysRef.current.has('keya') || keysRef.current.has('arrowleft')) moveVector.x -= 1
      if (keysRef.current.has('keyd') || keysRef.current.has('arrowright')) moveVector.x += 1

      if (moveVector.lengthSq() > 0) {
        moveVector.normalize()
        moveVector.multiplyScalar(moveSpeed * deltaTime)
        moveVector.applyQuaternion(cameraRef.current.quaternion)
        moveVector.y = 0 // Keep on ground level

        cameraRef.current.position.add(moveVector)
        playerPositionRef.current.copy(cameraRef.current.position)
      }
    }

    // Update bacteria behavior
    function updateBacteria(deltaTime: number) {
      if (!cameraRef.current) return

      const playerPos = cameraRef.current.position

      bacteriaRef.current.forEach(bacteria => {
        if (bacteria.health <= 0) return

        bacteria.wanderTimer -= deltaTime

        if (bacteria.type.behavior === 'wander') {
          // Wander randomly
          if (bacteria.wanderTimer <= 0 || !bacteria.targetPosition) {
            bacteria.targetPosition = bacteria.mesh.position.clone().add(
              new THREE.Vector3(
                (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 6
              )
            )
            bacteria.wanderTimer = 2 + Math.random() * 2
          }

          const direction = bacteria.targetPosition.clone().sub(bacteria.mesh.position).normalize()
          bacteria.velocity.lerp(direction.multiplyScalar(bacteria.type.speed), 0.02)
        } else if (bacteria.type.behavior === 'chase') {
          // Chase player if close enough
          const distToPlayer = bacteria.mesh.position.distanceTo(playerPos)
          if (distToPlayer < 15) {
            const direction = playerPos.clone().sub(bacteria.mesh.position).normalize()
            bacteria.velocity.lerp(direction.multiplyScalar(bacteria.type.speed), 0.05)
          } else {
            // Wander when far from player
            if (bacteria.wanderTimer <= 0 || !bacteria.targetPosition) {
              bacteria.targetPosition = bacteria.mesh.position.clone().add(
                new THREE.Vector3(
                  (Math.random() - 0.5) * 6,
                  0,
                  (Math.random() - 0.5) * 6
                )
              )
              bacteria.wanderTimer = 2 + Math.random() * 2
            }

            const direction = bacteria.targetPosition.clone().sub(bacteria.mesh.position).normalize()
            bacteria.velocity.lerp(direction.multiplyScalar(bacteria.type.speed * 0.5), 0.02)
          }
        }

        // Apply velocity
        bacteria.mesh.position.add(bacteria.velocity.clone().multiplyScalar(deltaTime))

        // Keep in bounds (y between 0.5 and 5)
        bacteria.mesh.position.y = Math.max(0.5, Math.min(5, bacteria.mesh.position.y))

        // Rotate bacteria for visual effect
        bacteria.mesh.rotation.y += deltaTime * 0.5
        bacteria.mesh.rotation.z = Math.sin(Date.now() * 0.002) * 0.1
      })
    }

    // Update projectiles and check collisions
    function updateProjectiles(deltaTime: number) {
      if (!sceneRef.current) return

      const projectilesToRemove: number[] = []
      const bacteriaToRemove: number[] = []

      projectilesRef.current.forEach((projectile, pIndex) => {
        // Move projectile
        projectile.mesh.position.add(
          projectile.direction.clone().multiplyScalar(projectile.speed * deltaTime)
        )

        // Check lifetime (3 seconds)
        if (Date.now() - projectile.createdAt > 3000) {
          projectilesToRemove.push(pIndex)
          return
        }

        // Check collision with bacteria
        bacteriaRef.current.forEach((bacteria, bIndex) => {
          if (bacteria.health <= 0) return

          const distance = projectile.mesh.position.distanceTo(bacteria.mesh.position)
          if (distance < 0.6) {
            // Hit!
            bacteria.health -= 1
            projectilesToRemove.push(pIndex)

            if (bacteria.health <= 0) {
              bacteriaToRemove.push(bIndex)
            }
          }
        })
      })

      // Remove projectiles (reverse order to avoid index issues)
      const uniqueProjectiles = Array.from(new Set(projectilesToRemove)).sort((a, b) => b - a)
      uniqueProjectiles.forEach(index => {
        const projectile = projectilesRef.current[index]
        if (projectile) {
          sceneRef.current!.remove(projectile.mesh)
          projectile.mesh.geometry.dispose()
          ;(projectile.mesh.material as THREE.Material).dispose()
          projectilesRef.current.splice(index, 1)
        }
      })

      // Remove bacteria and update score
      const uniqueBacteria = Array.from(new Set(bacteriaToRemove)).sort((a, b) => b - a)
      uniqueBacteria.forEach(index => {
        const bacteria = bacteriaRef.current[index]
        if (bacteria) {
          // Update score
          const newScore = score + bacteria.type.points
          setScore(newScore)
          onScoreUpdate(newScore)

          // Show educational fact
          showFact(bacteria.type.fact)

          // Track killed count
          setBacteriaKilled(prev => {
            const newCount = prev + 1
            // Check for completion (80% killed)
            const completionThreshold = Math.ceil(totalBacteria * 0.8)
            if (newCount >= completionThreshold && !gameComplete) {
              setGameComplete(true)
              const bonusScore = newScore + 50
              setScore(bonusScore)
              onComplete(Math.min(100, bonusScore))
            }
            return newCount
          })

          // Remove from scene
          sceneRef.current!.remove(bacteria.mesh)
          bacteria.mesh.traverse(child => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose()
              if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose())
              } else {
                child.material.dispose()
              }
            }
          })
          bacteriaRef.current.splice(index, 1)
        }
      })
    }

    // Animate floating red blood cells
    function animateRBCs(deltaTime: number) {
      sceneRef.current?.traverse(child => {
        if (child instanceof THREE.Mesh && child.geometry instanceof THREE.TorusGeometry) {
          const speed = child.userData.rotationSpeed
          if (speed) {
            child.rotation.x += speed.x * deltaTime
            child.rotation.y += speed.y * deltaTime
            child.rotation.z += speed.z * deltaTime
          }
          // Gentle floating motion
          child.position.y += Math.sin(Date.now() * 0.001 + child.position.x) * 0.002
        }
      })
    }

    // Animation loop
    const animate = () => {
      const deltaTime = Math.min(clockRef.current.getDelta(), 0.1)

      updatePlayer(deltaTime)
      updateBacteria(deltaTime)
      updateProjectiles(deltaTime)
      animateRBCs(deltaTime)

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current)
      }
    }

    renderer.setAnimationLoop(animate)

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return
      cameraRef.current.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)

      if (containerRef.current) {
        containerRef.current.removeEventListener('click', handleClick)
      }

      renderer.setAnimationLoop(null)
      renderer.dispose()

      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          if (Array.isArray(object.material)) {
            object.material.forEach(m => m.dispose())
          } else if (object.material) {
            object.material.dispose()
          }
        }
      })

      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement)
      }

      // Clear refs
      bacteriaRef.current = []
      projectilesRef.current = []
    }
  }, []) // Run once on mount

  // Sync score with state for completion check
  useEffect(() => {
    if (bacteriaKilled > 0 && totalBacteria > 0) {
      const completionThreshold = Math.ceil(totalBacteria * 0.8)
      if (bacteriaKilled >= completionThreshold && !gameComplete) {
        setGameComplete(true)
        const bonusScore = score + 50
        setScore(bonusScore)
        onComplete(Math.min(100, bonusScore))
      }
    }
  }, [bacteriaKilled, totalBacteria, score, gameComplete, onComplete])

  return (
    <div className="w-full h-[600px] relative select-none">
      <div ref={containerRef} className="w-full h-full cursor-crosshair" />

      {/* Score Display */}
      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg p-4 border border-gray-300 shadow-lg">
        <p className="text-gray-600 text-sm">Score</p>
        <p className="text-3xl font-bold text-cyan-600">{score}</p>
        <p className="text-gray-500 text-xs mt-2">
          Bacteria: {bacteriaKilled}/{totalBacteria}
        </p>
      </div>

      {/* Controls Help */}
      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-4 border border-gray-300 shadow-lg max-w-xs">
        <h3 className="text-gray-900 font-bold mb-2">Bacteria Hunter</h3>
        <p className="text-gray-700 text-sm mb-3">
          Navigate the bloodstream and eliminate harmful bacteria!
        </p>
        <div className="text-xs text-gray-600 space-y-1">
          <p><span className="font-semibold">WASD</span> - Move</p>
          <p><span className="font-semibold">Mouse</span> - Look around</p>
          <p><span className="font-semibold">Click</span> - Shoot antibodies</p>
          <p><span className="font-semibold">ESC</span> - Release cursor</p>
        </div>
      </div>

      {/* Crosshair */}
      {isPointerLocked && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="w-6 h-6 border-2 border-cyan-400 rounded-full opacity-75" />
          <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-cyan-400 rounded-full transform -translate-x-1/2 -translate-y-1/2" />
        </div>
      )}

      {/* Click to Start Overlay */}
      {!isPointerLocked && !gameComplete && (
        <div
          className="absolute inset-0 bg-black/60 flex items-center justify-center cursor-pointer"
          onClick={() => containerRef.current?.requestPointerLock()}
        >
          <div className="text-white text-center pointer-events-none">
            <div className="text-6xl mb-4">🦠</div>
            <p className="text-2xl font-bold mb-2">Click to Start</p>
            <p className="text-sm text-gray-300">Click anywhere to begin hunting bacteria</p>
          </div>
        </div>
      )}

      {/* Educational Fact Popup */}
      {currentFact && (
        <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 bg-cyan-600 text-white px-6 py-3 rounded-lg shadow-lg max-w-md text-center animate-pulse">
          <p className="text-sm font-medium">{currentFact}</p>
        </div>
      )}

      {/* Game Complete */}
      {gameComplete && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
          <div className="bg-white rounded-xl p-8 text-center max-w-sm">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Mission Complete!</h2>
            <p className="text-gray-600 mb-4">
              You eliminated {bacteriaKilled} bacteria and helped defend the body!
            </p>
            <p className="text-3xl font-bold text-cyan-600">Score: {score}</p>
          </div>
        </div>
      )}

      {/* Bacteria Types Legend */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 border border-gray-300 shadow-lg">
        <p className="text-xs text-gray-500 mb-2">Bacteria Types:</p>
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#88ff88' }} />
            <span className="text-gray-700">E. coli (10 pts)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ff88ff' }} />
            <span className="text-gray-700">Streptococcus (25 pts)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
