"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import { shouldAutoAdvance, stepIndex, wrapIndex } from "../../lib/carousel";
import styles from "./testimonials.module.css";

// Demonstration content only. Replace with approved customer quotes before
// removing the section disclosure; portraits do not depict customers.
const SAMPLES = [
  { name: "Maya Thompson", role: "Aged care worker", image: "sample-maya.jpg", quote: "Having my resume and application drafts in one place would make it easier to apply between shifts." },
  { name: "Daniel Chen", role: "Disability support worker", image: "sample-daniel.jpg", quote: "I want to see roles near home and review each email before it goes out. That gives me control over my job search." },
  { name: "Sophie Williams", role: "Community support worker", image: "sample-sophie.jpg", quote: "A clear list of prepared, approved and sent applications would help me keep track without another spreadsheet." },
  { name: "Aaron Patel", role: "Youth support worker", image: "sample-aaron.jpg", quote: "Starting with my real experience, then tailoring it to each role, is the kind of help I would find useful." },
];

export default function Testimonials() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(3);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [inView, setInView] = useState(false);
  const [hidden, setHidden] = useState(false);
  const regionRef = useRef<HTMLElement>(null);
  const positions = SAMPLES.length - visible + 1;
  const active = wrapIndex(index, positions);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 640px)");
    const tablet = window.matchMedia("(max-width: 1000px)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setVisible(mobile.matches ? 1 : tablet.matches ? 2 : 3); setReducedMotion(motion.matches); };
    const visibility = () => setHidden(document.hidden);
    update(); visibility();
    [mobile, tablet, motion].forEach(query => query.addEventListener("change", update));
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.15 });
    if (regionRef.current) observer.observe(regionRef.current);
    return () => { [mobile, tablet, motion].forEach(query => query.removeEventListener("change", update)); document.removeEventListener("visibilitychange", visibility); observer.disconnect(); };
  }, []);

  const running = shouldAutoAdvance({ slideCount: positions, interacting: hovered || focused || hidden || !inView, reducedMotion, paused });
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setIndex(current => stepIndex(current, positions, 1)), 6000);
    return () => window.clearInterval(timer);
  }, [positions, running]);

  return (
    <section id="testimonials" ref={regionRef} className={styles.section} aria-labelledby="testimonials-title"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
      <div className={styles.inner}>
        <div className={styles.heading}>
          <div><p className={styles.eyebrow}>Testimonials</p><h2 id="testimonials-title">A job search that fits your day.</h2></div>
        </div>
        <div className={styles.carousel} role="group" aria-roledescription="carousel" aria-label="Job search stories" aria-describedby="testimonials-note">
          <div className={styles.viewport}>
            <div className={styles.track} style={{ transform: `translateX(calc(${active} * (100% + 20px) / -${visible}))` }}>
              {SAMPLES.map((sample, card) => (
                <article className={styles.card} key={sample.name} aria-hidden={card < active || card >= active + visible} aria-roledescription="slide" aria-label={`${card + 1} of ${SAMPLES.length}`}>
                  <blockquote>{sample.quote}</blockquote>
                  <div className={styles.person}><Image src={`/images/testimonials/${sample.image}`} alt="" width={48} height={48} /><div><h3>{sample.name}</h3><p>{sample.role}</p></div></div>
                </article>
              ))}
            </div>
          </div>
          <div className={styles.controls}>
            <div className={styles.dots} role="group" aria-label="Choose testimonial position">{Array.from({ length: positions }, (_, position) => <button key={position} type="button" aria-label={`Show testimonial group ${position + 1}`} aria-pressed={active === position} onClick={() => setIndex(position)} />)}</div>
            <div className={styles.buttons}>
              <button type="button" aria-label={paused ? "Resume testimonials" : "Pause testimonials"} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}</button>
              <button type="button" aria-label="Previous testimonials" onClick={() => setIndex(current => stepIndex(current, positions, -1))}><ArrowLeft size={18} aria-hidden="true" /></button>
              <button type="button" aria-label="Next testimonials" onClick={() => setIndex(current => stepIndex(current, positions, 1))}><ArrowRight size={18} aria-hidden="true" /></button>
            </div>
          </div>
        </div>
        <p id="testimonials-note" className={styles.disclosure}>Illustrative stories with fictional names and quotes. Portraits do not depict customers.</p>
      </div>
    </section>
  );
}
