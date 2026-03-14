"use client"

import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  AnimatePresence,
  MotionValue,
  animate,
  motion,
  useAnimation,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react"

import { cn } from "@/lib/utils"

interface DockContextType {
  width: number
  hovered: boolean
  setIsZooming: (value: boolean) => void
  zoomLevel: MotionValue
  mouseX: MotionValue
  animatingIndexes: number[]
  setAnimatingIndexes: (indexes: number[]) => void
}

const INITIAL_WIDTH = 48

const DockContext = createContext<DockContextType>({
  width: 0,
  hovered: false,
  setIsZooming: () => {},
  zoomLevel: null as any,
  mouseX: null as any,
  animatingIndexes: [],
  setAnimatingIndexes: () => {},
})

const useDock = () => useContext(DockContext)

interface DockProps {
  className?: string
  children: ReactNode
}

function Dock({ className, children }: DockProps) {
  const [hovered, setHovered] = useState(false)
  const [width, setWidth] = useState(0)
  const dockRef = useRef<HTMLDivElement>(null)
  const isZooming = useRef(false)
  const [animatingIndexes, setAnimatingIndexes] = useState<number[]>([])

  const setIsZooming = useCallback((value: boolean) => {
    isZooming.current = value
    setHovered(!value)
  }, [])

  const zoomLevel = useMotionValue(1)

  useWindowResize(() => {
    setWidth(dockRef.current?.clientWidth || 0)
  })

  const mouseX = useMotionValue(Infinity)

  return (
    <DockContext.Provider
      value={{
        width,
        hovered,
        setIsZooming,
        zoomLevel,
        mouseX,
        animatingIndexes,
        setAnimatingIndexes,
      }}
    >
      <motion.div
        ref={dockRef}
        className={cn(
          "fixed bottom-4 left-1/2 z-30 mx-auto flex max-w-full items-end gap-1 rounded-2xl bg-background/80 backdrop-blur-xl border border-border shadow-lg px-3 py-2 overflow-x-auto",
          className
        )}
        onMouseMove={(e) => {
          mouseX.set(e.pageX)
          if (!isZooming.current) {
            setHovered(true)
          }
        }}
        onMouseLeave={() => {
          mouseX.set(Infinity)
          setHovered(false)
        }}
        style={{
          x: "-50%",
          scale: zoomLevel,
          scrollbarWidth: "none",
        }}
        role="toolbar"
        aria-label="Application dock"
      >
        {children}
      </motion.div>
    </DockContext.Provider>
  )
}

Dock.displayName = "Dock"

interface DockCardProps {
  children: ReactNode
  id: string
  onClick?: () => void
  isActive?: boolean
  label?: string
}

function DockCard({ children, id, onClick, isActive, label }: DockCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [elCenterX, setElCenterX] = useState(0)
  const dock = useDock()
  const [isHovered, setIsHovered] = useState(false)

  const size = useSpring(INITIAL_WIDTH, {
    stiffness: 320,
    damping: 20,
    mass: 0.1,
  })

  useMousePosition(
    {
      onChange: ({ value }) => {
        const mouseX = value.x
        if (dock.width > 0) {
          const transformedValue =
            INITIAL_WIDTH +
            36 *
              Math.cos((((mouseX - elCenterX) / dock.width) * Math.PI) / 2) **
                12

          if (dock.hovered) {
            animate(size, transformedValue)
          }
        }
      },
    },
    [elCenterX, dock]
  )

  useWindowResize(() => {
    const { x } = cardRef.current?.getBoundingClientRect() || { x: 0 }
    setElCenterX(x + INITIAL_WIDTH / 2)
  })

  const distance = useTransform(dock.mouseX, (val) => {
    const bounds = cardRef.current?.getBoundingClientRect() ?? {
      x: 0,
      width: 0,
    }
    return val - bounds.x - bounds.width / 2
  })

  const widthSync = useTransform(distance, [-150, 0, 150], [40, 80, 40])
  const width = useSpring(widthSync, { mass: 0.1, stiffness: 150, damping: 12 })

  return (
    <div className="relative flex flex-col items-center" ref={cardRef}>
      <AnimatePresence>
        {isHovered && label && (
          <motion.div
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: -8 }}
            exit={{ opacity: 0, y: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute -top-8 left-1/2 w-fit whitespace-pre rounded-md border border-border bg-popover px-2 py-0.5 text-xs text-popover-foreground shadow-md"
            style={{ x: "-50%" }}
            role="tooltip"
          >
            {label}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        style={{ width }}
        className={cn(
          "relative flex aspect-square cursor-pointer items-center justify-center rounded-xl transition-colors",
          isActive
            ? "bg-primary/10"
            : "hover:bg-muted"
        )}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        tabIndex={0}
        role="button"
        aria-label={label}
      >
        <motion.div
          className="flex items-center justify-center"
          style={{ width: useTransform(width, (val) => val * 0.5) }}
        >
          {children}
        </motion.div>
      </motion.div>

      {isActive && (
        <div className="absolute -bottom-1 h-1 w-1 rounded-full bg-primary" />
      )}
    </div>
  )
}

DockCard.displayName = "DockCard"

function DockDivider() {
  return (
    <div className="flex items-center px-1">
      <div className="h-6 w-px bg-border" />
    </div>
  )
}

DockDivider.displayName = "DockDivider"

// --- Hooks ---

type UseWindowResizeCallback = (width: number, height: number) => void

function useWindowResize(callback: UseWindowResizeCallback) {
  const callbackRef = useCallbackRef(callback)

  useEffect(() => {
    const handleResize = () => {
      callbackRef(window.innerWidth, window.innerHeight)
    }

    handleResize()
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [callbackRef])
}

function useCallbackRef<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  })

  return useMemo(() => ((...args: any[]) => callbackRef.current?.(...args)) as T, [])
}

interface MousePositionOptions {
  onChange?: (position: { value: { x: number; y: number } }) => void
}

function useMousePosition(
  options: MousePositionOptions = {},
  deps: readonly any[] = []
) {
  const { onChange } = options

  const x = useMotionValue(0)
  const y = useMotionValue(0)

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      animate(x, event.clientX)
      animate(y, event.clientY)
    }

    const handleChange = () => {
      if (onChange) {
        onChange({ value: { x: x.get(), y: y.get() } })
      }
    }

    const unsubscribeX = x.on("change", handleChange)
    const unsubscribeY = y.on("change", handleChange)

    window.addEventListener("mousemove", handleMouseMove)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      unsubscribeX()
      unsubscribeY()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, onChange, ...deps])

  return useMemo(
    () => ({ x, y }),
    [x, y]
  )
}

export { Dock, DockCard, DockDivider, useDock, useMousePosition }
