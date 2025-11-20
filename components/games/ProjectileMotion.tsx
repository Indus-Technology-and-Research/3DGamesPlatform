'use client'

import { useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js'

interface ProjectileMotionProps {
  onScoreUpdate: (score: number) => void
  onComplete: (score: number) => void
}

export default function ProjectileMotion({ onScoreUpdate, onComplete }: ProjectileMotionProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [angle, setAngle] = useState(45)
  const [velocity, setVelocity] = useState(15)
  const [successCount, setSuccessCount] = useState(0)
  const [isLaunched, setIsLaunched] = useState(false)
  const [dustbinDistance, setDustbinDistance] = useState(15)
  const [showTrajectory, setShowTrajectory] = useState(true)
  const [flightData, setFlightData] = useState<{
    maxHeight: number
    distance: number
    timeOfFlight: number
  } | null>(null)
  const [currentVelocity, setCurrentVelocity] = useState(0)
  const [message, setMessage] = useState('')
  const isLaunchedRef = useRef(false)

  // Separate effect for trajectory updates only
  useEffect(() => {
    if (!containerRef.current) return

    // Dispatch event to update trajectory
    window.dispatchEvent(new CustomEvent('updateTrajectory', { detail: { angle, velocity } }))
  }, [angle, velocity, showTrajectory])

  // Separate effect for dustbin distance changes
  useEffect(() => {
    if (!containerRef.current) return

    // Dispatch event to update dustbin position
    window.dispatchEvent(new CustomEvent('updateDustbinPosition', { detail: { distance: dustbinDistance } }))
  }, [dustbinDistance])

  useEffect(() => {
    if (!containerRef.current) return

    let Ammo: any = null
    let physicsWorld: any = null
    let ball: { mesh: THREE.Mesh; rigidBody: any } | null = null
    let dustbin: { mesh: THREE.Mesh; rigidBody: any } | null = null
    let trajectoryLine: THREE.Line | null = null
    let isPhysicsReady = false
    let launchStartTime = 0
    let maxHeightReached = 0

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x87CEEB) // Sky blue

    // Camera
    const camera = new THREE.PerspectiveCamera(
      50,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    )
    camera.position.set(15, 10, 25)
    camera.lookAt(0, 2, dustbinDistance)

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.xr.enabled = true
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    containerRef.current.appendChild(renderer.domElement)

    // VR Button
    const vrButton = VRButton.createButton(renderer)
    containerRef.current.appendChild(vrButton)

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(20, 30, 10)
    directionalLight.castShadow = true
    directionalLight.shadow.camera.left = -30
    directionalLight.shadow.camera.right = 30
    directionalLight.shadow.camera.top = 30
    directionalLight.shadow.camera.bottom = -30
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    scene.add(directionalLight)

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(100, 100)
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x90EE90,
      roughness: 0.8,
      metalness: 0.2
    })
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    // Grid helper
    const gridHelper = new THREE.GridHelper(100, 100, 0x888888, 0xcccccc)
    scene.add(gridHelper)

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.minDistance = 10
    controls.maxDistance = 50
    controls.maxPolarAngle = Math.PI / 2 - 0.1
    controls.update()

    // Initialize Ammo.js and create physics world
    async function initPhysics() {
      try {
        // @ts-ignore - Dynamic import of Ammo.js
        const AmmoLib = await import('ammo.js')
        Ammo = AmmoLib

        // Create collision configuration
        const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration()
        const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration)
        const overlappingPairCache = new Ammo.btDbvtBroadphase()
        const solver = new Ammo.btSequentialImpulseConstraintSolver()

        // Create physics world
        physicsWorld = new Ammo.btDiscreteDynamicsWorld(
          dispatcher,
          overlappingPairCache,
          solver,
          collisionConfiguration
        )

        // Set gravity
        physicsWorld.setGravity(new Ammo.btVector3(0, -9.81, 0))

        // Create ground physics
        createGroundPhysics()

        // Create dustbin
        createDustbin()

        // Create ball
        createBall()

        isPhysicsReady = true
      } catch (error) {
        console.error('Failed to initialize Ammo.js:', error)
      }
    }

    function createGroundPhysics() {
      const groundShape = new Ammo.btStaticPlaneShape(new Ammo.btVector3(0, 1, 0), 0)
      const groundTransform = new Ammo.btTransform()
      groundTransform.setIdentity()
      groundTransform.setOrigin(new Ammo.btVector3(0, 0, 0))

      const groundMotionState = new Ammo.btDefaultMotionState(groundTransform)
      const groundRbInfo = new Ammo.btRigidBodyConstructionInfo(
        0, // mass = 0 means static
        groundMotionState,
        groundShape,
        new Ammo.btVector3(0, 0, 0)
      )

      const groundBody = new Ammo.btRigidBody(groundRbInfo)
      groundBody.setRestitution(0.3)
      groundBody.setFriction(0.8)
      physicsWorld.addRigidBody(groundBody)
    }

    function createDustbin() {
      const dustbinRadius = 0.75
      const dustbinHeight = 1.2

      // Visual mesh
      const dustbinGeometry = new THREE.CylinderGeometry(dustbinRadius, dustbinRadius, dustbinHeight, 32, 1, true)
      const dustbinMaterial = new THREE.MeshStandardMaterial({
        color: 0x808080,
        side: THREE.DoubleSide,
        roughness: 0.7,
        metalness: 0.3
      })
      const dustbinMesh = new THREE.Mesh(dustbinGeometry, dustbinMaterial)
      dustbinMesh.position.set(0, dustbinHeight / 2, dustbinDistance)
      dustbinMesh.castShadow = true
      dustbinMesh.receiveShadow = true
      scene.add(dustbinMesh)

      // Create compound shape for hollow dustbin (walls + bottom, no top)
      const compoundShape = new Ammo.btCompoundShape()

      const wallThickness = 0.05
      const innerRadius = dustbinRadius - wallThickness

      // Bottom disk
      const bottomShape = new Ammo.btCylinderShape(
        new Ammo.btVector3(dustbinRadius, wallThickness / 2, dustbinRadius)
      )
      const bottomTransform = new Ammo.btTransform()
      bottomTransform.setIdentity()
      bottomTransform.setOrigin(new Ammo.btVector3(0, -dustbinHeight / 2 + wallThickness / 2, 0))
      compoundShape.addChildShape(bottomTransform, bottomShape)

      // Cylindrical wall (use thin cylinder shell)
      const wallShape = new Ammo.btCylinderShape(
        new Ammo.btVector3(wallThickness / 2, dustbinHeight / 2, wallThickness / 2)
      )

      // Create walls as multiple thin boxes around the perimeter
      const numWallSegments = 16
      for (let i = 0; i < numWallSegments; i++) {
        const angle = (i / numWallSegments) * Math.PI * 2
        const x = Math.cos(angle) * (dustbinRadius - wallThickness / 2)
        const z = Math.sin(angle) * (dustbinRadius - wallThickness / 2)

        const boxShape = new Ammo.btBoxShape(new Ammo.btVector3(wallThickness / 2, dustbinHeight / 2, wallThickness / 2))
        const boxTransform = new Ammo.btTransform()
        boxTransform.setIdentity()
        boxTransform.setOrigin(new Ammo.btVector3(x, 0, z))
        compoundShape.addChildShape(boxTransform, boxShape)
      }

      // Create rigid body with compound shape
      const transform = new Ammo.btTransform()
      transform.setIdentity()
      transform.setOrigin(new Ammo.btVector3(0, dustbinHeight / 2, dustbinDistance))

      const motionState = new Ammo.btDefaultMotionState(transform)
      const rbInfo = new Ammo.btRigidBodyConstructionInfo(
        0, // static
        motionState,
        compoundShape,
        new Ammo.btVector3(0, 0, 0)
      )

      const rigidBody = new Ammo.btRigidBody(rbInfo)
      rigidBody.setRestitution(0.3)
      rigidBody.setFriction(0.5)
      physicsWorld.addRigidBody(rigidBody)

      dustbin = { mesh: dustbinMesh, rigidBody }
    }

    function createBall() {
      const ballRadius = 0.15

      // Visual mesh
      const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32)
      const ballMaterial = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        roughness: 0.9,
        metalness: 0.1
      })
      const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial)
      ballMesh.position.set(0, ballRadius, 0)
      ballMesh.castShadow = true
      scene.add(ballMesh)

      // Physics body
      const transform = new Ammo.btTransform()
      transform.setIdentity()
      transform.setOrigin(new Ammo.btVector3(0, ballRadius, 0))

      const shape = new Ammo.btSphereShape(ballRadius)
      const motionState = new Ammo.btDefaultMotionState(transform)
      const localInertia = new Ammo.btVector3(0, 0, 0)
      shape.calculateLocalInertia(0.05, localInertia) // 50g mass

      const rbInfo = new Ammo.btRigidBodyConstructionInfo(
        0.05,
        motionState,
        shape,
        localInertia
      )

      const rigidBody = new Ammo.btRigidBody(rbInfo)
      rigidBody.setRestitution(0.6)
      rigidBody.setFriction(0.4)
      rigidBody.setDamping(0.01, 0.01)
      physicsWorld.addRigidBody(rigidBody)

      ball = { mesh: ballMesh, rigidBody }
    }

    function launchBall(launchAngle: number, launchVelocity: number) {
      if (!ball || !isPhysicsReady) return

      const angleRad = (launchAngle * Math.PI) / 180
      const vx = launchVelocity * Math.cos(angleRad)
      const vy = launchVelocity * Math.sin(angleRad)

      ball.rigidBody.setLinearVelocity(new Ammo.btVector3(0, vy, vx))
      ball.rigidBody.setAngularVelocity(new Ammo.btVector3(0, 0, 0))
      ball.rigidBody.setActivationState(1) // ACTIVE_TAG

      launchStartTime = Date.now()
      maxHeightReached = 0
      isLaunchedRef.current = true
      setIsLaunched(true)
      setMessage('')
      setFlightData(null)
    }

    function resetBall() {
      if (!ball || !Ammo) return

      const transform = new Ammo.btTransform()
      transform.setIdentity()
      transform.setOrigin(new Ammo.btVector3(0, 0.15, 0))

      ball.rigidBody.setWorldTransform(transform)
      ball.rigidBody.getMotionState().setWorldTransform(transform)
      ball.rigidBody.setLinearVelocity(new Ammo.btVector3(0, 0, 0))
      ball.rigidBody.setAngularVelocity(new Ammo.btVector3(0, 0, 0))
      ball.rigidBody.setActivationState(1)

      isLaunchedRef.current = false
      setIsLaunched(false)
      setCurrentVelocity(0)
      setFlightData(null)
      setMessage('')

      // Update trajectory
      updateTrajectoryLine()
    }

    function updateTrajectoryLine() {
      if (trajectoryLine) {
        scene.remove(trajectoryLine)
        trajectoryLine.geometry.dispose()
        ;(trajectoryLine.material as THREE.Material).dispose()
      }

      if (!showTrajectory) return

      const g = 9.81
      const angleRad = (angle * Math.PI) / 180
      const v0x = velocity * Math.cos(angleRad)
      const v0y = velocity * Math.sin(angleRad)

      // Calculate time to hit ground
      const timeToGround = v0y > 0 ? (v0y + Math.sqrt(v0y * v0y + 2 * g * 0.15)) / g : 0.5

      const points: THREE.Vector3[] = []
      const steps = 50

      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * timeToGround
        const x = 0
        const y = 0.15 + v0y * t - 0.5 * g * t * t
        const z = v0x * t

        if (y >= 0) {
          points.push(new THREE.Vector3(x, y, z))
        }
      }

      const trajectoryGeometry = new THREE.BufferGeometry().setFromPoints(points)
      const trajectoryMaterial = new THREE.LineDashedMaterial({
        color: 0xff0000,
        dashSize: 0.2,
        gapSize: 0.1,
        linewidth: 2,
      })

      trajectoryLine = new THREE.Line(trajectoryGeometry, trajectoryMaterial)
      trajectoryLine.computeLineDistances()
      scene.add(trajectoryLine)
    }

    function checkBallInDustbin() {
      if (!ball || !dustbin) return false

      const ballPos = ball.mesh.position
      const dustbinPos = dustbin.mesh.position

      const dx = ballPos.x - dustbinPos.x
      const dz = ballPos.z - dustbinPos.z
      const horizontalDist = Math.sqrt(dx * dx + dz * dz)

      // Dustbin: outer radius 0.75, wall thickness 0.05, so inner radius ~0.70
      // Bottom of dustbin is at y=0, top opening is at y=1.2
      const innerRadius = 0.70 // Inside the walls

      // Check if ball is inside the dustbin walls
      const isWithinWalls = horizontalDist < innerRadius

      // Check if ball is resting inside (above the bottom but not too high)
      const isInsideDustbin = ballPos.y > 0.05 && ballPos.y < 0.8

      return isWithinWalls && isInsideDustbin
    }

    function updatePhysics() {
      if (!ball || !Ammo || !isPhysicsReady) return

      const transform = new Ammo.btTransform()
      const ms = ball.rigidBody.getMotionState()

      if (ms) {
        ms.getWorldTransform(transform)
        const pos = transform.getOrigin()
        const rot = transform.getRotation()

        ball.mesh.position.set(pos.x(), pos.y(), pos.z())
        ball.mesh.quaternion.set(rot.x(), rot.y(), rot.z(), rot.w())

        // Get velocity for checks
        const vel = ball.rigidBody.getLinearVelocity()
        const yVelocity = vel.y()
        const speed = Math.sqrt(vel.x() * vel.x() + vel.y() * vel.y() + vel.z() * vel.z())

        // Track max height
        if (isLaunchedRef.current && pos.y() > maxHeightReached) {
          maxHeightReached = pos.y()
        }

        // Update current velocity
        if (isLaunchedRef.current) {
          setCurrentVelocity(speed)
        }

        // Ball has landed when it's near ground AND y-velocity is nearly zero (not bouncing)
        if (isLaunchedRef.current && pos.y() < 0.25 && Math.abs(yVelocity) < 0.2) {
          const timeOfFlight = (Date.now() - launchStartTime) / 1000
          const distance = pos.z()

          setFlightData({
            maxHeight: maxHeightReached - 0.15,
            distance: distance,
            timeOfFlight: timeOfFlight,
          })

          // Check if successful
          if (checkBallInDustbin()) {
            const newCount = successCount + 1
            setSuccessCount(newCount)
            const newScore = newCount * 20
            onScoreUpdate(newScore)
            setMessage('Success! 🎉')

            if (newCount >= 5) {
              setTimeout(() => onComplete(100), 1000)
            } else {
              // Next round after delay
              setTimeout(() => {
                const newDistance = 10 + Math.random() * 15 // 10-25m
                setDustbinDistance(newDistance)

                // Use event to trigger reset from React
                window.dispatchEvent(new CustomEvent('requestReset'))
              }, 2000)
            }
          } else {
            setMessage('Missed! Try adjusting angle and velocity.')

            // Reset ball after a miss too
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('requestReset'))
            }, 2000)
          }

          isLaunchedRef.current = false
          setIsLaunched(false)
        }
      }
    }

    // Initial trajectory line
    updateTrajectoryLine()

    // Listen for trajectory update event
    const handleUpdateTrajectory = (e: Event) => {
      const customEvent = e as CustomEvent
      const { angle: newAngle, velocity: newVelocity } = customEvent.detail

      // Update trajectory line with new values
      if (trajectoryLine) {
        scene.remove(trajectoryLine)
        trajectoryLine.geometry.dispose()
        ;(trajectoryLine.material as THREE.Material).dispose()
      }

      if (!showTrajectory) return

      const g = 9.81
      const angleRad = (newAngle * Math.PI) / 180
      const v0x = newVelocity * Math.cos(angleRad)
      const v0y = newVelocity * Math.sin(angleRad)

      const timeToGround = v0y > 0 ? (v0y + Math.sqrt(v0y * v0y + 2 * g * 0.15)) / g : 0.5

      const points: THREE.Vector3[] = []
      const steps = 50

      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * timeToGround
        const x = 0
        const y = 0.15 + v0y * t - 0.5 * g * t * t
        const z = v0x * t

        if (y >= 0) {
          points.push(new THREE.Vector3(x, y, z))
        }
      }

      const trajectoryGeometry = new THREE.BufferGeometry().setFromPoints(points)
      const trajectoryMaterial = new THREE.LineDashedMaterial({
        color: 0xff0000,
        dashSize: 0.2,
        gapSize: 0.1,
        linewidth: 2,
      })

      trajectoryLine = new THREE.Line(trajectoryGeometry, trajectoryMaterial)
      trajectoryLine.computeLineDistances()
      scene.add(trajectoryLine)
    }
    window.addEventListener('updateTrajectory', handleUpdateTrajectory)

    // Listen for dustbin position update event
    const handleUpdateDustbinPosition = (e: Event) => {
      const customEvent = e as CustomEvent
      const { distance } = customEvent.detail

      if (dustbin && Ammo) {
        dustbin.mesh.position.z = distance
        // Update physics body position
        const transform = new Ammo.btTransform()
        transform.setIdentity()
        transform.setOrigin(new Ammo.btVector3(0, 0.6, distance))
        dustbin.rigidBody.setWorldTransform(transform)
        dustbin.rigidBody.getMotionState().setWorldTransform(transform)
      }
    }
    window.addEventListener('updateDustbinPosition', handleUpdateDustbinPosition)

    // Listen for launch event
    const handleLaunchEvent = (e: Event) => {
      const customEvent = e as CustomEvent
      const { angle: launchAngle, velocity: launchVelocity } = customEvent.detail
      launchBall(launchAngle, launchVelocity)
    }
    window.addEventListener('launchBall', handleLaunchEvent)

    // Listen for reset request event
    const handleResetRequest = () => {
      resetBall()
    }
    window.addEventListener('requestReset', handleResetRequest)

    // Listen for reset ball event from React
    const handleResetBallEvent = () => {
      resetBall()
    }
    window.addEventListener('resetBall', handleResetBallEvent)

    // Animation loop
    const clock = new THREE.Clock()

    const animate = () => {
      if (physicsWorld && isPhysicsReady) {
        const deltaTime = Math.min(clock.getDelta(), 0.1)
        physicsWorld.stepSimulation(deltaTime, 10)
        updatePhysics()
      }

      controls.update()
      renderer.render(scene, camera)
    }

    // Handle resize
    const onResize = () => {
      if (!containerRef.current) return
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    }
    window.addEventListener('resize', onResize)

    // Start animation loop immediately
    renderer.setAnimationLoop(animate)

    // Initialize physics (async)
    initPhysics()

    // Cleanup
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('launchBall', handleLaunchEvent)
      window.removeEventListener('updateTrajectory', handleUpdateTrajectory)
      window.removeEventListener('updateDustbinPosition', handleUpdateDustbinPosition)
      window.removeEventListener('requestReset', handleResetRequest)
      window.removeEventListener('resetBall', handleResetBallEvent)
      renderer.setAnimationLoop(null)
      controls.dispose()
      renderer.dispose()

      // Clean up physics
      if (physicsWorld && Ammo) {
        if (ball) physicsWorld.removeRigidBody(ball.rigidBody)
        if (dustbin && dustbin.rigidBody) physicsWorld.removeRigidBody(dustbin.rigidBody)
        Ammo.destroy(physicsWorld)
      }

      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          if (object.material instanceof THREE.Material) {
            object.material.dispose()
          }
        }
      })

      if (containerRef.current) {
        const vrBtn = containerRef.current.querySelector('button')
        if (vrBtn) containerRef.current.removeChild(vrBtn)
        if (renderer.domElement && containerRef.current.contains(renderer.domElement)) {
          containerRef.current.removeChild(renderer.domElement)
        }
      }
    }
  }, [onScoreUpdate, onComplete]) // Only run once on mount

  const handleLaunch = () => {
    setIsLaunched(true)
  }

  // Trigger launch when isLaunched changes to true
  useEffect(() => {
    if (isLaunched && containerRef.current) {
      // Access the launchBall function through a ref or create a separate effect
      // For now, we'll use a custom event
      window.dispatchEvent(new CustomEvent('launchBall', { detail: { angle, velocity } }))
    }
  }, [isLaunched, angle, velocity])

  // Separate effect to handle reset requests
  const [resetRequested, setResetRequested] = useState(false)
  useEffect(() => {
    if (resetRequested) {
      window.dispatchEvent(new CustomEvent('resetBall'))
      setResetRequested(false)
    }
  }, [resetRequested])

  return (
    <div className="w-full h-[600px] relative">
      <div ref={containerRef} className="w-full h-full" />

      {/* Controls Panel */}
      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-4 border border-gray-300 shadow-lg max-w-xs space-y-4">
        <h3 className="text-gray-900 font-bold text-lg">Launch Controls</h3>

        <div>
          <label className="text-gray-700 text-sm font-semibold">Angle: {angle}°</label>
          <input
            type="range"
            min="0"
            max="90"
            value={angle}
            onChange={(e) => setAngle(Number(e.target.value))}
            disabled={isLaunched}
            className="w-full"
          />
        </div>

        <div>
          <label className="text-gray-700 text-sm font-semibold">Velocity: {velocity} m/s</label>
          <input
            type="range"
            min="5"
            max="30"
            value={velocity}
            onChange={(e) => setVelocity(Number(e.target.value))}
            disabled={isLaunched}
            className="w-full"
          />
        </div>

        <div className="text-sm text-gray-600">
          <p><strong>Dustbin Distance:</strong> {dustbinDistance.toFixed(1)} m</p>
        </div>

        <button
          onClick={handleLaunch}
          disabled={isLaunched}
          className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-colors"
        >
          {isLaunched ? 'In Flight...' : 'Launch'}
        </button>

        <div className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showTrajectory}
            onChange={(e) => setShowTrajectory(e.target.checked)}
            id="trajectory"
          />
          <label htmlFor="trajectory" className="text-gray-700">Show Trajectory</label>
        </div>
      </div>

      {/* Score Display */}
      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg p-4 border border-gray-300 shadow-lg">
        <p className="text-gray-600 text-sm">Successful Throws</p>
        <p className="text-3xl font-bold text-cyan-600">{successCount}/5</p>
      </div>

      {/* Formula Hints */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-4 border border-gray-300 shadow-lg max-w-md">
        <h4 className="text-gray-900 font-bold mb-2">Kinematic Equations</h4>
        <div className="text-sm text-gray-700 space-y-1 font-mono">
          <p>vₓ = v₀ × cos(θ)</p>
          <p>vᵧ = v₀ × sin(θ)</p>
          <p>y = vᵧt - ½gt²</p>
          <p>x = vₓt</p>
          <p className="text-xs text-gray-500 mt-2">g = 9.81 m/s²</p>
        </div>
      </div>

      {/* Flight Data */}
      {flightData && (
        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg p-4 border border-gray-300 shadow-lg">
          <h4 className="text-gray-900 font-bold mb-2">Flight Data</h4>
          <div className="text-sm text-gray-700 space-y-1">
            <p><strong>Max Height:</strong> {flightData.maxHeight.toFixed(2)} m</p>
            <p><strong>Distance:</strong> {flightData.distance.toFixed(2)} m</p>
            <p><strong>Time of Flight:</strong> {flightData.timeOfFlight.toFixed(2)} s</p>
          </div>
        </div>
      )}

      {/* Current Velocity */}
      {isLaunched && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/50 text-white px-4 py-2 rounded-lg">
          <p className="text-sm">Velocity: {currentVelocity.toFixed(2)} m/s</p>
        </div>
      )}

      {/* Message */}
      {message && (
        <div className={`absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 px-6 py-3 rounded-lg font-bold text-lg ${
          message.includes('Success') ? 'bg-green-500' : 'bg-yellow-500'
        } text-white shadow-lg`}>
          {message}
        </div>
      )}
    </div>
  )
}
