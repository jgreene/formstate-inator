import { expect } from 'chai';
import 'mocha';

import * as t from 'io-ts';
import * as tdc from 'io-ts-derive-class'
import { computed } from 'mobx';
import * as moment from 'moment';
import { register, required } from 'validator-inator';

import { deriveFormState, FormState } from './index';

const CityType = t.type({
    ID: t.number,
    Name: t.string
})

class City extends tdc.DeriveClass(CityType) {}

const AddressType = t.type({
    StreetAddress1: t.string,
    StreetAddress2: t.string,
    City: tdc.ref(City)
});

class Address extends tdc.DeriveClass(AddressType) {}

const PersonType = t.type({
    ID: t.Integer,
    FirstName: t.string,
    LastName: t.string,
    MiddleName: t.union([t.string, t.null]),
    Address: tdc.ref(Address),
    NullableAddress: t.union([tdc.ref(Address), t.null]),
    Addresses: t.array(tdc.ref(Address)),
    Birthdate: t.union([tdc.DateTime, t.null])
});

class Person extends tdc.DeriveClass(PersonType) {}

register<Person>(Person, {
    FirstName: (p) => p.FirstName.length > 8 ? "First Name may not be longer than 8 characters!" : null,
    Birthdate: [
        required(),
        (p) => p.Birthdate != null && p.Birthdate.isAfter(moment('01/01/2018', 'MM/DD/YYYY').add(-1, "day")) ? 'Cannot be born this year' : null
    ]
})

register<Address>(Address, {
    StreetAddress1: required()
})

class PersonFormState {
    constructor(public state: FormState<Person>){
        
    }

    @computed get FullName() {
        return this.state.value.FirstName.value + ' ' + this.state.value.LastName.value;
    }
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Person formstate', () => {
    it('FirstName matches in derived state', async () => {
        let person = new Person({ FirstName: 'Test'});
        const state = deriveFormState(person);

        expect(state.value).to.have.property("FirstName");
        expect(state.value.FirstName.value).eq('Test');
    });

    it('StreetAddress1 matches in derived state', async () => {
        let address = new Address({ StreetAddress1: 'Test Street1'});
        let person = new Person({ FirstName: 'Test', Address: address});
        const state = deriveFormState(person);

        expect(state.value.Address.value.StreetAddress1.value).eq(address.StreetAddress1);
    });

    it('FullName is calculated properly', async () => {
        let person = new Person({ FirstName: 'First', LastName: 'Last'});
        const state = deriveFormState(person);
        let personFormState = new PersonFormState(state);

        expect(personFormState).to.have.property("FullName");
        expect(personFormState.FullName).eq('First Last');

        state.value.FirstName.onChange('NewFirst');
        expect(state.value.FirstName.value).eq('NewFirst');
        expect(personFormState.FullName).eq('NewFirst Last');
    });

    it('Can get form model', async () => {
        let person = new Person({ FirstName: 'First', LastName: 'Last'});
        const state = deriveFormState(person);
        const street1 = '123 Test St';
        state.value.Address.value.StreetAddress1.onChange(street1);
        const model = state.model;
        Object.keys(person).forEach(k => {
            expect(model).to.have.property(k);
        });
        
        expect(model.FirstName).eq('First');

        const person2 = new Person(model);

        if(!(person2.Address instanceof Address)){
            expect(true).eq(false);
        }

        
        expect(model.Address.StreetAddress1).eq(street1);
        expect(person2.Address.StreetAddress1).eq(street1);
    });

    it('Can get path for state', async () => {
        let address = new Address({ StreetAddress1: 'Test Street1'});
        let person = new Person({ FirstName: 'Test', Address: address});
        person.Addresses.push(address);
        person.Addresses.push(address);
        const state = deriveFormState(person);
        
        expect(state.value.Address.value.StreetAddress1.path).eq('.Address.StreetAddress1');
        expect(state.value.Addresses.path).eq('.Addresses');
        expect(state.value.Addresses.value.getItem(0).value.StreetAddress1.path).eq('.Addresses[0].StreetAddress1');
        expect(state.value.Addresses.value.getItem(1).value.StreetAddress1.path).eq('.Addresses[1].StreetAddress1');
    });

    it('Setting an invalid value updates errors in form state on next cycle', async () => {
        let person = new Person({ FirstName: 'Test' });
        const state = deriveFormState(person);

        expect(state.value.FirstName.errors.length).eq(0);
        
        state.value.FirstName.onChange('ReallyLongInvalidName');
        await sleep(1);
        expect(state.value.FirstName.errors.length).eq(1);

    });

    it('Setting an valid value against an invalid value updates errors to empty on next cycle', async () => {
        let person = new Person({ FirstName: 'Test' });
        const state = deriveFormState(person);

        expect(state.value.FirstName.errors.length).eq(0);
        
        state.value.FirstName.onChange('ReallyLongInvalidName');
        await sleep(1);
        expect(state.value.FirstName.errors.length).eq(1);

        state.value.FirstName.onChange('Valid');
        await sleep(1);
        expect(state.value.FirstName.errors.length).eq(0);
    });

    it('Setting an valid birthdate results in no errors', async () => {
        let person = new Person({ FirstName: 'Test' });
        const state = deriveFormState(person);

        expect(state.value.FirstName.errors.length).eq(0);
        
        let date: any = moment('2017-01-18');
        state.value.Birthdate.onChange(date);
        await sleep(1);
        expect(state.value.Birthdate.errors.length).eq(0);
    });

    it('Birthdate is required', async () => {
        let person = new Person({ FirstName: 'Test' });
        const state = deriveFormState(person);
        expect(state.value.Birthdate.value).eq(null);
        

        state.value.Birthdate.validate();
        await sleep(1);
        expect(state.value.Birthdate.errors.length).eq(1);
    });

    it('Not setting a child value means nothing is dirty', async () => {
        let person = new Person({ FirstName: 'Test' });
        const state = deriveFormState(person);

        expect(state.dirty).eq(false);
    });

    it('Setting a child value marks parent as dirty', async () => {
        let person = new Person({ FirstName: 'Test' });
        const state = deriveFormState(person);

        state.value.FirstName.onChange('Change First');
        expect(state.dirty).eq(true);
    });

    it('Setting a deep child value marks all parents as dirty', async () => {
        let person = new Person({ FirstName: 'Test' });
        const state = deriveFormState(person);

        state.value.Address.value.StreetAddress1.onChange('123 St');

        expect(state.value.Address.dirty).eq(true);
        expect(state.dirty).eq(true);
        expect(state.value.Addresses.dirty).eq(false);
    });

    it('Setting a child value marks parent as dirty and resetting to previous value marks parent as not dirty', async () => {
        let person = new Person({ FirstName: 'Test' });
        const state = deriveFormState(person);

        state.value.FirstName.onChange('Change First');
        expect(state.dirty).eq(true);

        state.value.FirstName.onChange('Test');
        expect(state.dirty).eq(false);
    });

    const getTag = (type: t.Type<any>) => (type as any)['_tag'] as string;

    it('FormState has type metadata associated with it', async () => {
        let person = new Person({ FirstName: 'Test' });
        const state = deriveFormState(person);

        expect(state.type).is.not.null;
        expect(getTag(state.type)).eq('InterfaceType');
    });

    it('Children have correct associated type in FormState', async () => {
        let person = new Person({ FirstName: 'Test' });
        const state = deriveFormState(person);

        expect(getTag(state.value.Address.value.City.value.Name.type)).eq('StringType');
    });

    it('Child array has correct associated type in FormState', async () => {
        let person = new Person({ FirstName: 'Test' });
        const state = deriveFormState(person);

        expect(getTag(state.value.Addresses.type)).eq('ArrayType');
    });

    it('Child of array has correct associated type in FormState', async () => {
        let address = new Address({ StreetAddress1: 'Test Street1'});
        let person = new Person({ FirstName: 'Test', Address: address});
        person.Addresses.push(address);
        person.Addresses.push(address);
        const state = deriveFormState(person);

        expect(getTag(state.value.Addresses.value.getItem(0).type)).eq('InterfaceType');
        expect(getTag(state.value.Addresses.value.getItem(0).value.StreetAddress1.type)).eq('StringType');
    });

    it('Child union has correct associated type in FormState when null', async () => {
        let person = new Person({ FirstName: 'Test', NullableAddress: null  });
        const state = deriveFormState(person);

        expect(getTag(state.value.NullableAddress.type)).eq('UnionType');
    });

    it('Child union has correct associated type in FormState when not null', async () => {
        let address = new Address({ StreetAddress1: 'Test Street1'});
        let person = new Person({ FirstName: 'Test', NullableAddress: address  });
        const state = deriveFormState(person);

        expect(getTag(state.value.NullableAddress.type)).eq('UnionType');
    });

    it('Can add to array in formstate', async () => {
        let person = new Person({ FirstName: 'test' });
        let state = deriveFormState(person);

        expect(state.value.Addresses.value.length).eq(0);
        state.value.Addresses.value.push(new Address({ StreetAddress1: 'Test Street1' }));

        expect(state.value.Addresses.value.length).eq(1);
        expect(state.value.Addresses.value.getItem(0).value.StreetAddress1.value).eq('Test Street1');
    });

    it('Can remove from array in formstate', async () => {
        let person = new Person({ FirstName: 'test' });
        let state = deriveFormState(person);

        expect(state.value.Addresses.value.length).eq(0);
        state.value.Addresses.value.push(new Address({ StreetAddress1: 'Test Street1' }));
        state.value.Addresses.value.push(new Address({ StreetAddress1: 'Test2 Street1' }));

        expect(state.value.Addresses.value.length).eq(2);
        expect(state.value.Addresses.value.getItem(0).value.StreetAddress1.value).eq('Test Street1');
        
        state.value.Addresses.value.remove(0);

        expect(state.value.Addresses.value.length).eq(1);
        expect(state.value.Addresses.value.getItem(0).value.StreetAddress1.value).eq('Test2 Street1');
    });

    it('Can map over formstate array', async () => {
        let person = new Person({ FirstName: 'test' });
        let state = deriveFormState(person);

        expect(state.value.Addresses.value.length).eq(0);
        state.value.Addresses.value.push(new Address({ StreetAddress1: 'Test Street1' }));
        state.value.Addresses.value.push(new Address({ StreetAddress1: 'Test2 Street1' }));

        let street1s = state.value.Addresses.value.map(add => add.value.StreetAddress1.value);

        expect(street1s.length).eq(2);
        expect(street1s[0]).eq('Test Street1');
        expect(street1s[1]).eq('Test2 Street1');
    });

    it('Can validate address in array', async () => {
        let person = new Person({ FirstName: 'test', Addresses: [new Address()]});
        let state = deriveFormState(person);

        state.value.Addresses.value.getItem(0).value.StreetAddress1.validate();
        await sleep(1);
        expect(state.value.Addresses.value.getItem(0).value.StreetAddress1.errors.length).eq(1);
        
    });

    it('Path updates when array item is removed', async () => {

        let person = new Person({ FirstName: 'test' });
        let state = deriveFormState(person);

        

        expect(state.value.Addresses.value.length).eq(0);
        state.value.Addresses.value.push(new Address({ StreetAddress1: 'Test Street1' }));
        state.value.Addresses.value.push(new Address({ StreetAddress1: 'Test2 Street1' }));

        expect(state.value.Addresses.value.length).eq(2);
        //expect(state.value.Addresses.value.getItem(0).value.StreetAddress1.path).eq('.Addresses[0].StreetAddress1');
        expect(state.value.Addresses.value.getItem(0).value.StreetAddress1.value).eq('Test Street1');
        
        state.value.Addresses.value.remove(0);

        expect(state.value.Addresses.value.length).eq(1);
        expect(state.value.Addresses.value.getItem(0).value.StreetAddress1.path).eq('.Addresses[0].StreetAddress1');
        expect(state.value.Addresses.value.getItem(0).value.StreetAddress1.value).eq('Test2 Street1');

    });

    it('Can change reference to address', async () => {
        let person = new Person({ FirstName: 'test' });
        let state = deriveFormState(person);

        expect(state.value.NullableAddress.value).is.null;

        state.value.NullableAddress.setValue(new Address({ StreetAddress1: 'Test1'}));

        expect(state.value.NullableAddress.value).is.not.null;
        expect(state.value.NullableAddress.value!.StreetAddress1.value).eq('Test1');

        state.value.NullableAddress.value!.StreetAddress1.onChange('Test2');
        expect(state.value.NullableAddress.value!.StreetAddress1.value).eq('Test2');
    })
});