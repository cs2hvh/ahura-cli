'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi';
import Image from 'next/image';
import { GALLERY } from '@/lib/constants';

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 1000 : -1000,
    opacity: 0
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 1000 : -1000,
    opacity: 0
  })
};

const swipeConfidenceThreshold = 10000;
const swipePower = (offset: number, velocity: number) => {
  return Math.abs(offset) * velocity;
};

export default function Gallery() {
  const [[currentIndex, direction], setCurrentIndex] = useState([0, 0]);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const paginate = useCallback((newDirection: number) => {
    setCurrentIndex(([prevIndex]) => {
      const nextIndex = (prevIndex + newDirection + GALLERY.length) % GALLERY.length;
      return [nextIndex, newDirection];
    });
  }, []);

  const goToSlide = (index: number) => {
    const newDirection = index > currentIndex ? 1 : -1;
    setCurrentIndex([index, newDirection]);
  };

  useEffect(() => {
    if (!isAutoPlaying) return;

    const interval = setInterval(() => {
      paginate(1);
    }, 5000);

    return () => clearInterval(interval);
  }, [isAutoPlaying, paginate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        paginate(-1);
        setIsAutoPlaying(false);
      } else if (e.key === 'ArrowRight') {
        paginate(1);
        setIsAutoPlaying(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [paginate]);

  const handlePrevious = () => {
    paginate(-1);
    setIsAutoPlaying(false);
  };

  const handleNext = () => {
    paginate(1);
    setIsAutoPlaying(false);
  };

  return (
    <section id="gallery" className="py-20 md:py-32 bg-gradient-to-b from-black via-purple-950/50 to-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400">
            Game Gallery
          </h2>
          <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto">
            Explore stunning visuals from our epic adventure
          </p>
        </div>

        <div className="relative">
          <div className="relative h-[400px] md:h-[500px] lg:h-[600px] overflow-hidden rounded-2xl bg-black/50 border border-purple-500/30 shadow-2xl shadow-purple-500/20">
            <AnimatePresence initial={false} custom={direction}>
              <motion.div
                key={currentIndex}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 }
                }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={1}
                onDragEnd={(e, { offset, velocity }) => {
                  const swipe = swipePower(offset.x, velocity.x);

                  if (swipe < -swipeConfidenceThreshold) {
                    paginate(1);
                    setIsAutoPlaying(false);
                  } else if (swipe > swipeConfidenceThreshold) {
                    paginate(-1);
                    setIsAutoPlaying(false);
                  }
                }}
                className="absolute inset-0 flex flex-col items-center justify-center"
              >
                <div className="relative w-full h-full">
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-10"></div>
                  <Image
                    src={GALLERY[currentIndex].imagePath}
                    alt={GALLERY[currentIndex].title}
                    fill
                    className="object-cover"
                    priority={currentIndex === 0}
                  />
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-8 z-20">
                  <h3 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                    {GALLERY[currentIndex].title}
                  </h3>
                  <p className="text-base md:text-lg text-gray-300">
                    {GALLERY[currentIndex].description}
                  </p>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <button
            onClick={handlePrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-30 bg-purple-600/20 hover:bg-purple-600/40 backdrop-blur-sm text-white p-3 rounded-full transition-all duration-200 hover:scale-110 border border-purple-500/30"
            aria-label="Previous image"
          >
            <HiChevronLeft className="text-2xl" />
          </button>

          <button
            onClick={handleNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-30 bg-purple-600/20 hover:bg-purple-600/40 backdrop-blur-sm text-white p-3 rounded-full transition-all duration-200 hover:scale-110 border border-purple-500/30"
            aria-label="Next image"
          >
            <HiChevronRight className="text-2xl" />
          </button>

          <div className="flex justify-center gap-2 mt-8">
            {GALLERY.map((_, index) => (
              <button
                key={index}
                onClick={() => {
                  goToSlide(index);
                  setIsAutoPlaying(false);
                }}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === currentIndex
                    ? 'w-8 bg-gradient-to-r from-purple-500 to-pink-500 shadow-lg shadow-purple-500/50'
                    : 'w-2 bg-purple-500/40 hover:bg-purple-500/60'
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
