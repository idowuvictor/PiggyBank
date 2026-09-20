'use client'

import { useEffect, useRef } from 'react'

type Props = {
  videoUrl: string
  posterUrl?: string
  cssFilter?: string
}

export default function HeroVideoBackground({ videoUrl, posterUrl, cssFilter }: Props) {
  const videoARef = useRef<HTMLVideoElement>(null)
  const videoBRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const videoA = videoARef.current
    const videoB = videoBRef.current
    if (!videoA || !videoB) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReducedMotion) {
      videoA.removeAttribute('autoplay')
      videoA.pause()
      videoB.pause()
      try {
        videoA.currentTime = 0
      } catch (e) {}
      return
    }

    const FADE = 0.9
    let cur = videoA
    let nxt = videoB
    let swapping = false

    function play(v: HTMLVideoElement) {
      const p = v.play()
      if (p !== undefined) {
        p.catch(() => {})
      }
    }

    play(videoA)

    function tick() {
      if (swapping || !cur.duration) return
      if (cur.duration - cur.currentTime > FADE) return

      swapping = true
      const out = cur

      nxt.currentTime = 0
      play(nxt)
      nxt.classList.add('is-active')
      out.classList.remove('is-active')

      cur = nxt
      nxt = out

      setTimeout(() => {
        out.pause()
        out.currentTime = 0
        swapping = false
      }, FADE * 1000 + 100)
    }

    videoA.addEventListener('timeupdate', tick)
    videoB.addEventListener('timeupdate', tick)

    return () => {
      videoA.removeEventListener('timeupdate', tick)
      videoB.removeEventListener('timeupdate', tick)
    }
  }, [])

  return (
    <div className="bg">
      <video
        ref={videoARef}
        className="bg-video is-active"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        aria-hidden="true"
        poster={posterUrl}
        style={{ filter: cssFilter }}
      >
        <source src={videoUrl} type="video/mp4" />
      </video>
      <video
        ref={videoBRef}
        className="bg-video"
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        aria-hidden="true"
        poster={posterUrl}
        style={{ filter: cssFilter }}
      >
        <source src={videoUrl} type="video/mp4" />
      </video>
    </div>
  )
}
