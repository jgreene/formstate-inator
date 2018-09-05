import { expect } from 'chai';
import 'mocha';

import * as t from 'io-ts';
import * as tdc from 'io-ts-derive-class'
import { computed } from 'mobx';
import * as moment from 'moment';
import { register } from 'validator-inator';

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
    Addresses: t.array(tdc.ref(Address)),
    Birthdate: t.union([tdc.DateTime, t.null])
});

class Person extends tdc.DeriveClass(PersonType) {}

register<Person>(Person, {
    FirstName: (p) => p.FirstName.length > 8 ? "First Name may not be longer than 8 characters!" : null
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
        expect(state.value.Addresses.value[0].value.StreetAddress1.path).eq('.Addresses[0].StreetAddress1');
        expect(state.value.Addresses.value[1].value.StreetAddress1.path).eq('.Addresses[1].StreetAddress1');
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
        
        let date: any = moment('2018-01-18');
        state.value.Birthdate.onChange(date);
        await sleep(1);
        expect(state.value.Birthdate.errors.length).eq(0);
    });

    
});