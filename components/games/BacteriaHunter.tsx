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
  // GOOD bacteria (penalty for killing)
  ecoli: {
    name: 'E. coli (Good)',
    color: 0x44dd44, // Bright green = good
    speed: 1.5,
    health: 1,
    points: -10, // Penalty for killing good bacteria!
    behavior: 'wander',
    fact: 'Oops! E. coli is helpful - it makes vitamin K and protects your gut!',
    scale: 0.4
  },
  lactobacillus: {
    name: 'Lactobacillus (Good)',
    color: 0x44ccdd, // Cyan = good
    speed: 1,
    health: 1,
    points: -10, // Penalty
    behavior: 'wander',
    fact: 'Oops! Lactobacillus helps digest food and fights bad bacteria!',
    scale: 0.35
  },
  // BAD bacteria (points for killing)
  salmonella: {
    name: 'Salmonella (Bad)',
    color: 0xff4444, // Red = bad
    speed: 3,
    health: 1,
    points: 10, // Reward for killing
    behavior: 'chase',
    fact: 'Nice! Salmonella causes food poisoning - good riddance!',
    scale: 0.45
  },
  hpylori: {
    name: 'H. pylori (Bad)',
    color: 0xff8800, // Orange = bad
    speed: 2.5,
    health: 2,
    points: 10, // Reward
    behavior: 'chase',
    fact: 'Great! H. pylori can cause stomach ulcers - eliminated!',
    scale: 0.4
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

    // Scene setup - Stomach/Intestine environment
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x4a2020) // Dark pinkish interior
    scene.fog = new THREE.FogExp2(0x3d2525, 0.02) // Warm atmospheric fog
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

    // Lighting - warm pinkish for stomach interior
    const ambientLight = new THREE.AmbientLight(0xffaaaa, 0.5)
    scene.add(ambientLight)

    // Main light - warm pink
    const pointLight = new THREE.PointLight(0xffcccc, 0.8, 40)
    pointLight.position.set(0, 8, 0)
    scene.add(pointLight)

    // Acid glow - slight green tint
    const acidLight = new THREE.PointLight(0xaaff99, 0.3, 50)
    acidLight.position.set(0, 2, 0)
    scene.add(acidLight)

    // Player light (follows camera)
    const playerLight = new THREE.PointLight(0xffffff, 0.4, 12)
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

    // Generate level rooms - simple open areas
    function generateLevel(): Room[] {
      const rooms: Room[] = []

      // Main spawn area
      rooms.push({
        position: new THREE.Vector3(0, 0, 0),
        size: { width: 30, height: 10, depth: 30 },
        hasBacteria: false
      })

      // Additional areas for bacteria
      rooms.push({
        position: new THREE.Vector3(0, 0, -20),
        size: { width: 20, height: 10, depth: 20 },
        hasBacteria: true
      })

      rooms.push({
        position: new THREE.Vector3(20, 0, 0),
        size: { width: 20, height: 10, depth: 20 },
        hasBacteria: true
      })

      rooms.push({
        position: new THREE.Vector3(-20, 0, 0),
        size: { width: 20, height: 10, depth: 20 },
        hasBacteria: true
      })

      rooms.push({
        position: new THREE.Vector3(0, 0, 20),
        size: { width: 20, height: 10, depth: 20 },
        hasBacteria: true
      })

      return rooms
    }

    // Create visual geometry for level - Stomach/Intestine environment
    function createLevelGeometry(scene: THREE.Scene, rooms: Room[]) {
      // Floor - stomach lining (pink/flesh tone)
      const floorGeom = new THREE.PlaneGeometry(100, 100)
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0xd4a5a5, // Pink flesh tone
        roughness: 0.85,
      })
      const floor = new THREE.Mesh(floorGeom, floorMat)
      floor.rotation.x = -Math.PI / 2
      floor.position.y = 0
      floor.receiveShadow = true
      scene.add(floor)

      // Ceiling - mucous membrane (darker pink)
      const ceilingGeom = new THREE.PlaneGeometry(100, 100)
      const ceilingMat = new THREE.MeshStandardMaterial({
        color: 0xa07070,
        roughness: 0.8,
      })
      const ceiling = new THREE.Mesh(ceilingGeom, ceilingMat)
      ceiling.rotation.x = Math.PI / 2
      ceiling.position.y = 12
      scene.add(ceiling)

      // Walls - intestinal walls (pink with slight texture)
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0xc99090,
        roughness: 0.75,
      })

      // Front wall
      const wallGeom = new THREE.PlaneGeometry(100, 12)
      const frontWall = new THREE.Mesh(wallGeom, wallMat)
      frontWall.position.set(0, 6, -50)
      scene.add(frontWall)

      // Back wall
      const backWall = new THREE.Mesh(wallGeom, wallMat.clone())
      backWall.position.set(0, 6, 50)
      backWall.rotation.y = Math.PI
      scene.add(backWall)

      // Left wall
      const sideWallGeom = new THREE.PlaneGeometry(100, 12)
      const leftWall = new THREE.Mesh(sideWallGeom, wallMat.clone())
      leftWall.position.set(-50, 6, 0)
      leftWall.rotation.y = Math.PI / 2
      scene.add(leftWall)

      // Right wall
      const rightWall = new THREE.Mesh(sideWallGeom, wallMat.clone())
      rightWall.position.set(50, 6, 0)
      rightWall.rotation.y = -Math.PI / 2
      scene.add(rightWall)

      // Add rugae (stomach folds/ridges) on walls
      for (let i = 0; i < 15; i++) {
        const rugaeGeom = new THREE.TorusGeometry(48, 0.8, 8, 64, Math.PI)
        const rugaeMat = new THREE.MeshStandardMaterial({
          color: 0xb88080,
          roughness: 0.7,
        })
        const rugae = new THREE.Mesh(rugaeGeom, rugaeMat)
        rugae.position.set(0, 1 + i * 0.7, 0)
        rugae.rotation.x = Math.PI / 2
        rugae.rotation.z = (i * 0.3) + Math.random() * 0.2
        scene.add(rugae)
      }

      // Add villi (intestinal finger-like projections) instead of pillars
      for (let i = 0; i < 25; i++) {
        const angle = Math.random() * Math.PI * 2
        const radius = 10 + Math.random() * 35
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius

        // Villus - finger-like projection
        const villusHeight = 2 + Math.random() * 4
        const villusRadius = 0.4 + Math.random() * 0.4

        // Create villus using capsule-like shape
        const villusGeom = new THREE.CapsuleGeometry(villusRadius, villusHeight, 8, 16)
        const villusMat = new THREE.MeshStandardMaterial({
          color: 0xdfb0b0,
          roughness: 0.6,
          transparent: true,
          opacity: 0.9,
        })
        const villus = new THREE.Mesh(villusGeom, villusMat)
        villus.position.set(x, villusHeight / 2 + 0.5, z)
        scene.add(villus)
      }

      // Add mucus patches on floor
      for (let i = 0; i < 15; i++) {
        const mucusGeom = new THREE.CircleGeometry(1.5 + Math.random() * 2, 16)
        const mucusMat = new THREE.MeshStandardMaterial({
          color: 0xcccc88, // Yellowish mucus
          roughness: 0.4,
          transparent: true,
          opacity: 0.7,
        })
        const mucus = new THREE.Mesh(mucusGeom, mucusMat)
        mucus.rotation.x = -Math.PI / 2
        mucus.position.set(
          (Math.random() - 0.5) * 80,
          0.02,
          (Math.random() - 0.5) * 80
        )
        scene.add(mucus)
      }

      // Add floating gastric bubbles (instead of red blood cells)
      for (let i = 0; i < 40; i++) {
        const bubbleSize = 0.2 + Math.random() * 0.4
        const bubbleGeom = new THREE.SphereGeometry(bubbleSize, 12, 12)
        const bubbleMat = new THREE.MeshStandardMaterial({
          color: 0xbbddaa, // Slight greenish (stomach acid)
          roughness: 0.2,
          transparent: true,
          opacity: 0.5,
          metalness: 0.1,
        })
        const bubble = new THREE.Mesh(bubbleGeom, bubbleMat)

        bubble.position.set(
          (Math.random() - 0.5) * 80,
          1 + Math.random() * 9,
          (Math.random() - 0.5) * 80
        )

        bubble.userData.rotationSpeed = {
          x: (Math.random() - 0.5) * 0.2,
          y: (Math.random() - 0.5) * 0.2,
          z: (Math.random() - 0.5) * 0.2
        }
        bubble.userData.floatOffset = Math.random() * Math.PI * 2
        bubble.userData.floatSpeed = 0.5 + Math.random() * 0.5

        scene.add(bubble)
      }

      // Add some food particle chunks floating
      for (let i = 0; i < 20; i++) {
        const chunkGeom = new THREE.DodecahedronGeometry(0.3 + Math.random() * 0.5, 0)
        const chunkMat = new THREE.MeshStandardMaterial({
          color: 0x998866, // Brownish food color
          roughness: 0.8,
        })
        const chunk = new THREE.Mesh(chunkGeom, chunkMat)

        chunk.position.set(
          (Math.random() - 0.5) * 70,
          0.5 + Math.random() * 3,
          (Math.random() - 0.5) * 70
        )
        chunk.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)

        chunk.userData.rotationSpeed = {
          x: (Math.random() - 0.5) * 0.1,
          y: (Math.random() - 0.5) * 0.1,
          z: (Math.random() - 0.5) * 0.1
        }

        scene.add(chunk)
      }

      // Add point lights with warmer colors
      const light1 = new THREE.PointLight(0xffaaaa, 0.4, 35)
      light1.position.set(25, 5, 25)
      scene.add(light1)

      const light2 = new THREE.PointLight(0xffbbbb, 0.4, 35)
      light2.position.set(-25, 5, -25)
      scene.add(light2)

      // Acid glow lights (greenish)
      const acidLight1 = new THREE.PointLight(0xaaffaa, 0.2, 25)
      acidLight1.position.set(0, 1, 0)
      scene.add(acidLight1)

      const acidLight2 = new THREE.PointLight(0xbbffbb, 0.15, 20)
      acidLight2.position.set(30, 2, -30)
      scene.add(acidLight2)
    }

    // Spawn bacteria in a room
    function spawnBacteriaInRoom(scene: THREE.Scene, room: Room, roomIndex: number): number {
      const bacteriaCount = 5 + Math.floor(Math.random() * 4) // 5-8 per room (more bacteria to make 100 pts achievable)
      const types = Object.keys(BACTERIA_TYPES)

      for (let i = 0; i < bacteriaCount; i++) {
        const typeKey = types[Math.floor(Math.random() * types.length)]
        const type = BACTERIA_TYPES[typeKey]

        // Create bacteria mesh group
        const group = new THREE.Group()

        if (typeKey === 'ecoli') {
          // E. coli (Good) - Rod-shaped with flagella (green)
          const bodyGeom = new THREE.CapsuleGeometry(0.15, 0.4, 4, 8)
          const bodyMat = new THREE.MeshStandardMaterial({
            color: type.color,
            roughness: 0.6,
            emissive: type.color,
            emissiveIntensity: 0.3
          })
          const body = new THREE.Mesh(bodyGeom, bodyMat)
          body.rotation.z = Math.PI / 2
          group.add(body)

          // Add flagella (thin tails)
          for (let f = 0; f < 3; f++) {
            const flagellaGeom = new THREE.CylinderGeometry(0.02, 0.01, 0.5, 4)
            const flagellaMat = new THREE.MeshStandardMaterial({ color: 0x33aa33 })
            const flagella = new THREE.Mesh(flagellaGeom, flagellaMat)
            flagella.position.set(-0.35, 0, (f - 1) * 0.1)
            flagella.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.3
            group.add(flagella)
          }
        } else if (typeKey === 'lactobacillus') {
          // Lactobacillus (Good) - Longer rod shape (cyan)
          const bodyGeom = new THREE.CapsuleGeometry(0.1, 0.6, 4, 8)
          const bodyMat = new THREE.MeshStandardMaterial({
            color: type.color,
            roughness: 0.5,
            emissive: type.color,
            emissiveIntensity: 0.3
          })
          const body = new THREE.Mesh(bodyGeom, bodyMat)
          body.rotation.z = Math.PI / 2
          group.add(body)
        } else if (typeKey === 'salmonella') {
          // Salmonella (Bad) - Rod with many flagella (red)
          const bodyGeom = new THREE.CapsuleGeometry(0.12, 0.35, 4, 8)
          const bodyMat = new THREE.MeshStandardMaterial({
            color: type.color,
            roughness: 0.4,
            emissive: type.color,
            emissiveIntensity: 0.4
          })
          const body = new THREE.Mesh(bodyGeom, bodyMat)
          body.rotation.z = Math.PI / 2
          group.add(body)

          // Many flagella (dangerous looking)
          for (let f = 0; f < 6; f++) {
            const flagellaGeom = new THREE.CylinderGeometry(0.015, 0.008, 0.4, 4)
            const flagellaMat = new THREE.MeshStandardMaterial({ color: 0xcc2222 })
            const flagella = new THREE.Mesh(flagellaGeom, flagellaMat)
            const angle = (f / 6) * Math.PI * 2
            flagella.position.set(-0.25, Math.sin(angle) * 0.15, Math.cos(angle) * 0.15)
            flagella.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.5
            group.add(flagella)
          }
        } else if (typeKey === 'hpylori') {
          // H. pylori (Bad) - Spiral/helical shape (orange)
          const spiralPoints = []
          for (let s = 0; s < 20; s++) {
            const t = s / 19
            spiralPoints.push(new THREE.Vector3(
              t * 0.6 - 0.3,
              Math.sin(t * Math.PI * 3) * 0.08,
              Math.cos(t * Math.PI * 3) * 0.08
            ))
          }
          const spiralCurve = new THREE.CatmullRomCurve3(spiralPoints)
          const spiralGeom = new THREE.TubeGeometry(spiralCurve, 16, 0.06, 8, false)
          const spiralMat = new THREE.MeshStandardMaterial({
            color: type.color,
            roughness: 0.4,
            emissive: type.color,
            emissiveIntensity: 0.4
          })
          const spiral = new THREE.Mesh(spiralGeom, spiralMat)
          group.add(spiral)

          // Add flagella at ends
          for (let f = 0; f < 4; f++) {
            const flagellaGeom = new THREE.CylinderGeometry(0.015, 0.008, 0.3, 4)
            const flagellaMat = new THREE.MeshStandardMaterial({ color: 0xdd6600 })
            const flagella = new THREE.Mesh(flagellaGeom, flagellaMat)
            flagella.position.set(-0.35, (f - 1.5) * 0.05, 0)
            flagella.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.4
            group.add(flagella)
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
          // Update score (can be negative for good bacteria!)
          setScore(prevScore => {
            const newScore = Math.max(0, prevScore + bacteria.type.points) // Don't go below 0
            onScoreUpdate(newScore)

            // Check for completion at 100 points
            if (newScore >= 100 && !gameComplete) {
              setGameComplete(true)
              onComplete(100)
            }

            return newScore
          })

          // Show educational fact
          showFact(bacteria.type.fact)

          // Track killed count
          setBacteriaKilled(prev => prev + 1)

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
        <h3 className="text-gray-900 font-bold mb-2">Gut Defender</h3>
        <p className="text-gray-700 text-sm mb-3">
          Explore the digestive system and eliminate harmful bacteria!
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
            <p className="text-sm text-gray-300">Enter the digestive system and hunt harmful bacteria!</p>
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
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Gut Defended!</h2>
            <p className="text-gray-600 mb-4">
              You eliminated {bacteriaKilled} harmful bacteria and protected the digestive system!
            </p>
            <p className="text-3xl font-bold text-cyan-600">Score: {score}</p>
          </div>
        </div>
      )}

      {/* Bacteria Types Legend */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 border border-gray-300 shadow-lg">
        <p className="text-xs text-gray-500 mb-2">Reach 100 points to win!</p>
        <div className="space-y-2 text-xs">
          <div>
            <p className="text-red-600 font-semibold mb-1">BAD - Shoot these! (+10 pts)</p>
            <div className="flex gap-3">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ff4444' }} />
                <span className="text-gray-700">Salmonella</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ff8800' }} />
                <span className="text-gray-700">H. pylori</span>
              </div>
            </div>
          </div>
          <div>
            <p className="text-green-600 font-semibold mb-1">GOOD - Don&apos;t shoot! (-10 pts)</p>
            <div className="flex gap-3">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#44dd44' }} />
                <span className="text-gray-700">E. coli</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#44ccdd' }} />
                <span className="text-gray-700">Lactobacillus</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
