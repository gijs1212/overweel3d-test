import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Thomas de Vries",
    role: "Hobbyist maker",
    content: "Eindelijk een 3D-printservice die begrijpt wat ik nodig heb. Snelle levering en top kwaliteit!",
    rating: 5,
    avatar: "T",
  },
  {
    name: "Lisa Jansen",
    role: "Product designer",
    content: "Snelle service en top kwaliteit. 10/10 zou opnieuw plastic laten smelten.",
    rating: 5,
    avatar: "L",
  },
  {
    name: "Mark Bakker",
    role: "Startup founder",
    content: "Prototypes bestellen was nog nooit zo makkelijk. Van upload tot product in 3 dagen!",
    rating: 5,
    avatar: "M",
  },
];

export function Testimonials() {
  return (
    <section className="py-24 bg-background overflow-hidden">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
            Wat onze klanten zeggen
          </h2>
          <p className="text-lg text-muted-foreground">
            Echt feedback van echte printliefhebbers
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="relative bg-card rounded-2xl p-8 shadow-overweel-card"
            >
              <Quote className="absolute top-6 right-6 w-10 h-10 text-accent/20" />
              
              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                ))}
              </div>

              {/* Content */}
              <p className="text-foreground/80 mb-6 leading-relaxed">
                "{testimonial.content}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold">
                  {testimonial.avatar}
                </div>
                <div>
                  <p className="font-semibold text-primary">{testimonial.name}</p>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
