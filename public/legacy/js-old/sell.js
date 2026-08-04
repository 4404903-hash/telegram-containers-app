/* AutoBazar — створення звичайного оголошення */

function setStep(step) {
  $$(".wizard-step").forEach((element) => {
    element.classList.toggle(
      "active",
      Number(element.dataset.step) === step
    );
  });

  $$(".step-indicator i").forEach((element, index) => {
    element.classList.toggle("active", index < step);
  });
}

$$(".next-step").forEach((button) => {
  button.onclick = () => {
    const current = button.closest(".wizard-step");

    const inputs = [
      ...current.querySelectorAll(
        "input[required], textarea[required]"
      )
    ];

    if (inputs.some((input) => !input.reportValidity())) {
      return;
    }

    setStep(Number(current.dataset.step) + 1);
  };
});

$$(".prev-step").forEach((button) => {
  button.onclick = () => {
    setStep(
      Number(button.closest(".wizard-step").dataset.step) - 1
    );
  };
});

function resetWizard() {
  $("#sellForm").reset();
  setStep(1);
}

$("#sellForm").onsubmit = (event) => {
  event.preventDefault();

  const payload = Object.fromEntries(
    new FormData(event.currentTarget).entries()
  );

  socket.emit("listing:create", payload);
};