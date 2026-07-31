import wppconnect from "@wppconnect-team/wppconnect";

let creator = (options) => wppconnect.create(options);

export function createWppClient(options) {
  return creator(options);
}

// Deliberately exported to allow deterministic lifecycle integration tests.
export function setWppClientCreatorForTests(nextCreator) {
  creator = nextCreator;
}

export function resetWppClientCreatorForTests() {
  creator = (options) => wppconnect.create(options);
}
