'use client'

import { useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js'

interface MoleculeBuilderProps {
  onScoreUpdate: (score: number) => void
  onComplete: (score: number) => void
}

interface Atom {
  element: string
  color: string
  position: [number, number, number]
  scale?: number
}

interface Bond {
  start: [number, number, number]
  end: [number, number, number]
}

interface Molecule {
  name: string
  atoms: Atom[]
  bonds: Bond[]
}

const molecules: { [key: string]: Molecule } = {
  water: {
    name: 'Water (H₂O)',
    atoms: [
      { element: 'O', color: '#ff0000', position: [0, 0, 0], scale: 1.2 },
      { element: 'H', color: '#ffffff', position: [-1.2, 0.8, 0] },
      { element: 'H', color: '#ffffff', position: [1.2, 0.8, 0] },
    ],
    bonds: [
      { start: [0, 0, 0], end: [-1.2, 0.8, 0] },
      { start: [0, 0, 0], end: [1.2, 0.8, 0] },
    ],
  },
  co2: {
    name: 'Carbon Dioxide (CO₂)',
    atoms: [
      { element: 'C', color: '#808080', position: [0, 0, 0] },
      { element: 'O', color: '#ff0000', position: [-1.5, 0, 0], scale: 1.2 },
      { element: 'O', color: '#ff0000', position: [1.5, 0, 0], scale: 1.2 },
    ],
    bonds: [
      { start: [0, 0, 0], end: [-1.5, 0, 0] },
      { start: [0, 0, 0], end: [1.5, 0, 0] },
    ],
  },
  methane: {
    name: 'Methane (CH₄)',
    atoms: [
      { element: 'C', color: '#808080', position: [0, 0, 0] },
      { element: 'H', color: '#ffffff', position: [1, 1, 0] },
      { element: 'H', color: '#ffffff', position: [-1, 1, 0] },
      { element: 'H', color: '#ffffff', position: [1, -1, 0] },
      { element: 'H', color: '#ffffff', position: [-1, -1, 0] },
    ],
    bonds: [
      { start: [0, 0, 0], end: [1, 1, 0] },
      { start: [0, 0, 0], end: [-1, 1, 0] },
      { start: [0, 0, 0], end: [1, -1, 0] },
      { start: [0, 0, 0], end: [-1, -1, 0] },
    ],
  },
  ammonia: {
    name: 'Ammonia (NH₃)',
    atoms: [
      { element: 'N', color: '#0000ff', position: [0, 0, 0], scale: 1.1 },
      { element: 'H', color: '#ffffff', position: [0, 1.2, 0] },
      { element: 'H', color: '#ffffff', position: [-1, -0.6, 0] },
      { element: 'H', color: '#ffffff', position: [1, -0.6, 0] },
    ],
    bonds: [
      { start: [0, 0, 0], end: [0, 1.2, 0] },
      { start: [0, 0, 0], end: [-1, -0.6, 0] },
      { start: [0, 0, 0], end: [1, -0.6, 0] },
    ],
  },
}

// Create text sprite
function createTextSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  canvas.width = 256
  canvas.height = 128

  context.fillStyle = '#000000' // Black text for white background
  context.font = 'Bold 80px Arial'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, 128, 64)

  const texture = new THREE.CanvasTexture(canvas)
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture })
  const sprite = new THREE.Sprite(spriteMaterial)
  sprite.scale.set(0.6, 0.3, 1)

  return sprite
}

export default function MoleculeBuilder({ onScoreUpdate, onComplete }: MoleculeBuilderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [currentMolecule, setCurrentMolecule] = useState<string>('water')
  const [viewedMolecules, setViewedMolecules] = useState<Set<string>>(new Set(['water']))

  // Three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const moleculeGroupRef = useRef<THREE.Group | null>(null)
  const atomMeshesRef = useRef<THREE.Mesh[]>([])
  const clockRef = useRef(new THREE.Clock())

  useEffect(() => {
    if (!containerRef.current) return

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xffffff) // White background
    sceneRef.current = scene

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      50,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    )
    camera.position.set(0, 0, 8)
    cameraRef.current = camera

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.xr.enabled = true // Enable WebXR
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Add VR button
    const vrButton = VRButton.createButton(renderer)
    containerRef.current.appendChild(vrButton)

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const pointLight1 = new THREE.PointLight(0xffffff, 1)
    pointLight1.position.set(10, 10, 10)
    scene.add(pointLight1)

    const pointLight2 = new THREE.PointLight(0xffffff, 0.5)
    pointLight2.position.set(-10, -10, -10)
    scene.add(pointLight2)

    const spotLight = new THREE.SpotLight(0xffffff, 0.5)
    spotLight.position.set(0, 10, 0)
    scene.add(spotLight)

    // Create molecule group
    const moleculeGroup = new THREE.Group()
    scene.add(moleculeGroup)
    moleculeGroupRef.current = moleculeGroup

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableZoom = true
    controls.maxDistance = 15
    controls.minDistance = 3
    controlsRef.current = controls

    // Animation loop
    const animate = () => {
      const elapsed = clockRef.current.getElapsedTime()

      // Rotate atoms
      atomMeshesRef.current.forEach((mesh) => {
        mesh.rotation.y = elapsed * 0.2
      })

      controls.update()
      renderer.render(scene, camera)
    }

    // Use setAnimationLoop for VR compatibility
    renderer.setAnimationLoop(animate)

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current) return
      const width = containerRef.current.clientWidth
      const height = containerRef.current.clientHeight

      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }

    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)

      renderer.setAnimationLoop(null)

      controls.dispose()
      renderer.dispose()

      if (containerRef.current) {
        const vrButton = containerRef.current.querySelector('button')
        if (vrButton) containerRef.current.removeChild(vrButton)
        if (renderer.domElement && containerRef.current.contains(renderer.domElement)) {
          containerRef.current.removeChild(renderer.domElement)
        }
      }
    }
  }, [])

  // Update molecule when selection changes
  useEffect(() => {
    if (!moleculeGroupRef.current) return

    const moleculeGroup = moleculeGroupRef.current
    const molecule = molecules[currentMolecule]

    // Clear previous molecule
    while (moleculeGroup.children.length > 0) {
      const child = moleculeGroup.children[0]
      moleculeGroup.remove(child)
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material) {
          child.material.dispose()
        }
      } else if (child instanceof THREE.Line) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material) {
          child.material.dispose()
        }
      } else if (child instanceof THREE.Sprite) {
        if (child.material instanceof THREE.Material) {
          child.material.dispose()
        }
      }
    }
    atomMeshesRef.current = []

    // Create bonds (render first so they appear behind atoms)
    molecule.bonds.forEach((bond) => {
      const points = [
        new THREE.Vector3(...bond.start),
        new THREE.Vector3(...bond.end),
      ]
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points)
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 })
      const line = new THREE.Line(lineGeometry, lineMaterial)
      moleculeGroup.add(line)
    })

    // Create atoms
    molecule.atoms.forEach((atom) => {
      const scale = atom.scale || 1
      const sphereGeometry = new THREE.SphereGeometry(0.5 * scale, 32, 32)
      const sphereMaterial = new THREE.MeshStandardMaterial({
        color: atom.color,
        metalness: 0.3,
        roughness: 0.4,
        emissive: atom.color,
        emissiveIntensity: 0.2,
      })
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
      sphere.position.set(...atom.position)
      moleculeGroup.add(sphere)
      atomMeshesRef.current.push(sphere)

      // Create text label
      const textSprite = createTextSprite(atom.element)
      textSprite.position.set(atom.position[0], atom.position[1] + 0.8 * scale, atom.position[2])
      moleculeGroup.add(textSprite)
    })
  }, [currentMolecule])

  const handleMoleculeChange = (moleculeKey: string) => {
    setCurrentMolecule(moleculeKey)
    const newViewed = new Set(viewedMolecules)
    newViewed.add(moleculeKey)
    setViewedMolecules(newViewed)

    const score = newViewed.size * 25
    onScoreUpdate(score)

    if (newViewed.size === Object.keys(molecules).length) {
      setTimeout(() => {
        onComplete(100)
      }, 1000)
    }
  }

  const molecule = molecules[currentMolecule]

  return (
    <div className="w-full h-[600px] relative">
      <div ref={containerRef} className="w-full h-full" />

      {/* Molecule Selector */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-lg p-4 border border-gray-300 shadow-lg">
        <div className="flex flex-col gap-3">
          <div className="text-center text-gray-900 font-bold">
            {molecule.name}
          </div>
          <div className="flex gap-2">
            {Object.keys(molecules).map((key) => (
              <button
                key={key}
                onClick={() => handleMoleculeChange(key)}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  currentMolecule === key
                    ? 'bg-cyan-600 text-white'
                    : viewedMolecules.has(key)
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-600 text-white hover:bg-gray-500'
                }`}
              >
                {molecules[key].name.split('(')[0].trim()}
                {viewedMolecules.has(key) && ' ✓'}
              </button>
            ))}
          </div>
          <div className="text-center text-sm text-gray-700">
            Explored: {viewedMolecules.size}/{Object.keys(molecules).length} molecules
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-4 border border-gray-300 shadow-lg max-w-xs">
        <h3 className="text-gray-900 font-bold mb-2">Molecule Explorer</h3>
        <p className="text-gray-700 text-sm mb-2">
          Explore different molecular structures in 3D! Drag to rotate and scroll to zoom.
        </p>
        <div className="text-xs text-gray-600">
          <p>🔴 Red = Oxygen (O)</p>
          <p>⚪ White = Hydrogen (H)</p>
          <p>⚫ Gray = Carbon (C)</p>
          <p>🔵 Blue = Nitrogen (N)</p>
        </div>
      </div>
    </div>
  )
}
