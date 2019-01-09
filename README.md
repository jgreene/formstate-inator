Create complex forms in a straight forward, testable, and UI framework agnostic manner.  This library integrates with [validator-inator](https://github.com/jgreene/validator-inator).

Examples

Play with the below example here: [![Edit k0442jj955](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/s/k0442jj955)

```ts
    import * as t from "io-ts";
    import * as tdc from "io-ts-derive-class";
    import {
        ValidationRegistry,
        required,
        min,
        max,
        isValid
    } from "validator-inator";
    import { deriveFormState, FormState } from "formstate-inator";

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
    });

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
        if (p.Email !== null || p.Phone !== null || p.Addresses.length > 0) {
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

    const app = document.getElementById("app");

    function log(message) {
        if (typeof message == "object") {
            app.innerHTML +=
            (JSON && JSON.stringify ? JSON.stringify(message) : message) + "<br />";
        } else {
            app.innerHTML += message + "<br />";
        }
    }

    function logJSON(input: any) {
        log(JSON.stringify(input, null, 2));
    }

    function sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    app.innerHTML = `validating...`;

    (async function() {
        app.innerHTML = ``;
        const myValidationCtx = {};
        const testPerson1 = new Person();
        const form = new PersonForm(testPerson1, myValidationCtx);

        await form.state.validate();

        logJSON(form.state.value.LastName.errors);

        form.state.value.LastName.onChange("Doofenschmirtz");

        await sleep(1); //validation is always asynchronous so we need to wait for the results after a change
        logJSON(form.state.value.LastName.errors);

        //model is always up to date with the current form state
        //but is in the same shape as the original data passed into deriveFormState
        logJSON(form.state.model);

        form.state.value.Addresses.value.push(new Address());

        logJSON(form.state.model);
        await form.state.validate();

        const address1 = form.state.value.Addresses.value.getItem(0);
        logJSON(address1.value.StreetAddress1.errors);

        address1.value.StreetAddress1.onChange("Evil Inc.");
        logJSON(form.state.model);
        await sleep(1); //wait for validation errors to get updated
        logJSON(address1.value.StreetAddress1.errors);
    })();
```

Usage can be viewed in src/index.spec.ts

Contributing

    yarn install
    yarn run test 