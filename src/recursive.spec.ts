import { expect } from 'chai';
import 'mocha';

import * as t from 'io-ts';
import * as tdc from 'io-ts-derive-class'

import { deriveFormState } from './index';

type Operators = 'equals' | 'notEquals'

const Operators = {
    equals: 'equals' as Operators,
    notEquals: 'notEquals' as Operators
}

const FieldPredicateType = t.type({
    _tag: t.literal('FieldPredicateType'),
    FieldName: t.string,
    Operator: t.union([t.keyof(Operators), t.null]),
    Value: t.union([t.string, t.number, t.boolean, tdc.DateTime, t.null, t.undefined])
})

export class FieldPredicate extends tdc.DeriveClass(FieldPredicateType) { }

export function isFieldPredicate(input: any): input is FieldPredicate {
    return !!input && input._tag === 'FieldPredicateType'
}

interface IPredicateGroup {
    _tag: 'PredicateGroupType'
    Kind: 'AND' | 'OR'
    Predicates: Array<FieldPredicate | IPredicateGroup>
}

function toInterfaceType<T>(t: t.RecursiveType<any>): t.InterfaceType<T, T> {
    return t.type;
}

const PredicateGroupType: t.InterfaceType<IPredicateGroup, IPredicateGroup> = toInterfaceType(
    t.recursion<IPredicateGroup>('PredicateGroupType', PredicateGroupType =>
        t.type({
            _tag: t.literal('PredicateGroupType'),
            Kind: t.union([t.literal('AND'), t.literal('OR')]),
            Predicates: t.array(t.union([tdc.ref(FieldPredicate), PredicateGroupType]))
        })
    )
)

export class PredicateGroup extends tdc.DeriveClass(PredicateGroupType) { }

export function isPredicateGroup(input: any): input is PredicateGroup {
    return !!input && input._tag === 'PredicateGroupType'
}

const AdvancedFindType = t.type({
    TopGroup: tdc.ref(PredicateGroup)
})

export class AdvancedFind extends tdc.DeriveClass(AdvancedFindType) { }

describe('AdvancedFind formstate', () => {
    it('Formstate splits types properly', async () => {
        const original = new AdvancedFind({ 
            TopGroup: new PredicateGroup({ 
                Kind: 'AND', 
                Predicates: [
                    new FieldPredicate({ FieldName: 'Field1', Operator: 'equals', Value: 1 })
                ]
            }) 
        });
        const state = deriveFormState(original);
        const tags = state.value.TopGroup.value.Predicates.value.map(p => p.value._tag.value);

        expect(tags.length).eq(1);
        expect(tags[0]).eq('FieldPredicateType')
    })
})