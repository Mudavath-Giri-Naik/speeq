const plans = [
  {
    name: "Starter",
    price: "₹0",
    description: "Browse the demo subjects and practise at your own pace.",
  },
  {
    name: "Focus",
    price: "₹149",
    description: "Example plan for topic reviews and practice reminders.",
  },
  {
    name: "Revision",
    price: "₹299",
    description: "Example plan for timed quizzes and a revision schedule.",
  },
];

/** Shows three illustrative study plans. */
export default function Pricing() {
  return (
    <>
      <h1>Pricing</h1>
      <p>These are sample plans for the demo. Purchases are unavailable.</p>
      <div className="grid">
        {plans.map((plan) => (
          <section className="card" key={plan.name}>
            <h2>{plan.name}</h2>
            <p className="price">
              {plan.price}
              <small> / month</small>
            </p>
            <p>{plan.description}</p>
          </section>
        ))}
      </div>
    </>
  );
}
