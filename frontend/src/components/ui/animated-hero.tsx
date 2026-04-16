"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MoveRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

function Hero() {
  const [titleNumber, setTitleNumber] = useState(0);
  const titles = useMemo(
    () => ["profitable", "automated", "precise", "reliable", "efficient"],
    []
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (titleNumber === titles.length - 1) {
        setTitleNumber(0);
      } else {
        setTitleNumber(titleNumber + 1);
      }
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [titleNumber, titles]);

  return (
    <div className="w-full">
      <div className="container mx-auto">
        <div className="flex gap-8 py-20 lg:py-40 items-center justify-center flex-col">
          <div className="flex gap-4 flex-col">
            <h1 className="text-5xl md:text-7xl lg:text-8xl max-w-3xl tracking-tighter text-center font-extrabold drop-shadow-xl z-10">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-rose-500 to-red-600 animate-pulse">
                Trading crypto is now
              </span>
              <span className="relative flex w-full justify-center overflow-hidden text-center md:pb-4 md:pt-4 text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                &nbsp;
                {titles.map((title, index) => (
                  <motion.span
                    key={index}
                    className="absolute font-black text-white"
                    initial={{ opacity: 0, y: "-100" }}
                    transition={{ type: "spring", stiffness: 50 }}
                    animate={
                      titleNumber === index
                        ? {
                            y: 0,
                            opacity: 1,
                          }
                        : {
                            y: titleNumber > index ? -150 : 150,
                            opacity: 0,
                          }
                    }
                  >
                    {title}
                  </motion.span>
                ))}
              </span>
            </h1>

            <p className="text-lg md:text-xl leading-relaxed tracking-tight text-slate-300 max-w-2xl text-center mt-6 drop-shadow-sm">
              Navigating the volatile crypto market is a challenge. Avoid costly
              mistakes by ditching manual monitoring and guesswork. Our AI delivers
              real-time, high-accuracy crypto signals, making your
              trading journey more profitable and efficient than ever.
            </p>
          </div>
          <div className="flex flex-row gap-3 mt-4 z-10 relative">
            <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full" />
            <Link to="/login?signup=true" className="relative group">
              <Button size="lg" className="gap-4 bg-white text-black hover:bg-slate-200 font-bold text-lg px-8 py-6 rounded-full transition-transform hover:scale-105 shadow-[0_0_40px_rgba(34,211,238,0.4)]">
                Start Trading <MoveRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
          
          {/* Decorative glowing orbs behind the text */}
          <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-[100px] -z-10 pointer-events-none" />
          <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-rose-500/10 rounded-full blur-[100px] -z-10 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}

export { Hero };
