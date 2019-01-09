import { expect } from 'chai';
import 'mocha';

import * as t from "io-ts";
import * as tdc from "io-ts-derive-class";
import {
  ValidationRegistry,
  required,
  min,
  max,
  isValid
} from "validator-inator";
import { deriveFormState, FormState } from "./index";

//This is used so that you can pass dependencies to validation functions
//e.g. if you want to call a web service you could reference it here
type MyValidationContext = {};

const registry = new ValidationRegistry<MyValidationContext>();

const AddressType = t.type({
  ID: t.number,
  StreetAddress1: t.string,
  City: t.string,
  State: t.string
});

class Address extends tdc.DeriveClass(AddressType) {}

registry.register(Address, {
    StreetAddress1: required()
})

const PersonType = t.type({
  ID: t.number,
  FirstName: t.string,
  LastName: t.string,
  Email: t.union([t.string, t.null]),
  Phone: t.union([t.string, t.null]),
  Addresses: t.array(tdc.ref(Address))
});

class Person extends tdc.DeriveClass(PersonType) {}

const mustHaveContactMethodValidator = (p: Person) => {
  const validResult = { Email: null, Phone: null, Addresses: null };
  if (p.Email !== null || p.Phone !== null || p.Addresses.length > 1) {
    return validResult;
  }

  const message =
    "A person must have an Email or a Phone or a Physical Address!";

  return { Email: message, Phone: message, Addresses: message };
};

registry.register(Person, {
  FirstName: required(),
  LastName: [required(), min(1)],
  Email: mustHaveContactMethodValidator,
  Phone: mustHaveContactMethodValidator,
  Addresses: mustHaveContactMethodValidator
});

class PersonForm {
  state: FormState<Person>;
  constructor(public originalValue: Person, ctx: MyValidationContext) {
    this.state = deriveFormState(originalValue, registry, ctx);
  }
}

describe('Array validation errors', () => {
    it('LastName validation errors', async () => {
        const person = new Person({ FirstName: 'Test'});
        const form = new PersonForm(person, {});

        await form.state.validate();

        expect(form.state.value).to.have.property("LastName");
        expect(form.state.value.LastName.errors.length).eq(2);
        expect(form.state.value.LastName.errors[0]).eq('is required')
        expect(form.state.value.LastName.errors[1]).eq('must be at least 1 characters')
    });

    it('Address validation errors', async () => {
        const person = new Person({ FirstName: 'Test', Addresses: [new Address()]});
        const form = new PersonForm(person, {});

        await form.state.validate();

        expect(form.state.value.Addresses.errors.length).eq(1);
        const address = form.state.value.Addresses.value.getItem(0);
        expect(address.value.StreetAddress1.errors.length).eq(1)
    });
});