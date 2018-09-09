import { observable, runInAction, extendObservable } from 'mobx';

import { validate, getRequiredFieldsFor } from 'validator-inator';
import * as moment from 'moment';

type primitive = string | number | boolean | null | undefined | moment.Moment;

function isPrimitive(input: any): input is primitive {
    return typeof input === "string"
        || typeof input === "boolean"
        || typeof input === "number"
        || input === null
        || input === undefined
        || moment.isMoment(input);
}

export type InputState<TValue> = {
    value: TValue;
    errors: string[];
    visible: boolean;
    disabled: boolean;
    dirty: boolean;
    touched: boolean;
    required: boolean;
    path: string;

    setErrors(errors: string[]): void;
    setVisibility(visible: boolean): void;
    setDisabled(disabled: boolean): void;
    setRequired(required: boolean): void;
    onChange(newValue: TValue): void;
};

function isInputState(input: any): input is InputState<any> {
    return input && input.isInputStateImpl === true;
}

export type FormStateType<T> = {
    [P in keyof T]: T[P] extends Function ? never :
                    T[P] extends primitive ? InputState<T[P]> :
                    T[P] extends Array<infer U> ? U extends primitive ? InputState<InputState<U>[]> : InputState<FormState<U>[]> :
                    InputState<FormStateType<T[P]>>;
}

export type ModelState<T> = {
    [P in keyof T]: T[P] extends Function ? never :
                    T[P] extends primitive ? T[P] :
                    T[P] extends Array<infer U> ? U extends primitive ? U[] : ModelState<U>[] :
                    ModelState<T[P]>
}

interface IFormModel<T> {
    readonly model: T;
}

export type FormState<T> = InputState<FormStateType<T>> & IFormModel<T>

export type Constructor<T = {}> = new (...args: any[]) => T;

function getInputState(input: any, fireChange: Function, parent: any = null, path: string = '', required: boolean = false): any
{
    if(isPrimitive(input))
    {
        return getInputStateImpl(input, fireChange, parent, path, required) as any;
    }

    if(input instanceof Array || Array.isArray(input))
    {
        const res: any = input.map((entry: any, i: number) => getInputState(entry, fireChange, input, path + '[' + i + ']'));
        return getInputStateImpl(res, fireChange, parent, path) as any;
    }

    const keys = Object.keys(input);
    if(keys.length > 0){
        const requiredFields: any = getRequiredFieldsFor(input.constructor);
        const isRequiredField = (field: string) => requiredFields[field] === true;

        const record:any = {};
        keys.forEach(k => {
            const value: any = input[k];
            const required = isRequiredField(k);
            record[k] = getInputState(value, fireChange, record, path + '.' + k, required);
        });

        return getInputStateImpl(record, fireChange, parent, path) as any;
    }

    throw 'Could not create inputstate from ' + JSON.stringify(input);
}

function applyErrorsToFormState(result: any, input: InputState<any>) {
    if(Array.isArray(result)){
        if(Array.isArray((result as any).errors)){
            input.setErrors((result as any).errors);
            result.forEach((r, i) => {
                applyErrorsToFormState(r, input.value[i]);
            });
            return;
        } else {
            input.setErrors(result);
            return;
        }
    }

    let keys = Object.keys(result);
    if(keys.length > 0){
        keys.forEach(k => {
            const value = result[k];
            const formInput = input.value[k];
            
            applyErrorsToFormState(value, formInput);
        });
    }
}

export function deriveFormState<T>(input: T): FormState<T> {

    const runValidation = function(current: InputState<any>, form: FormState<T>): void {
        validate(form.model as any, current.path).then(result => {

            applyErrorsToFormState(result, form);
        });
    };

    var getFormState: () => FormState<T> | undefined = () => undefined;
    const trigger = (current: InputState<any>) => {
        let form = getFormState();
        if(form !== undefined)
        {
            runValidation(current, form);
        }
    };

    const state = getInputState(input, trigger);
    const obs = observable(state);
    extendObservable(obs, {
        get model(): T { return new (input as any).constructor(getFormModel<T>(this as any) as any); },
    });

    getFormState = () => obs;
    
    return obs;
}

function getInputModel(input: any): any {
    if(isPrimitive(input))
    {
        return input;
    }

    if(isInputState(input)){
        return getInputModel(input.value);
    }

    if(input instanceof Array || Array.isArray(input)){
        return input.map((i: any) => getInputModel(i));
    }

    const keys = Object.keys(input);
    if(keys.length > 0){
        const res:any = {};
        keys.forEach(k => {
            const value: any = input[k];
            res[k] = getInputModel(value);
        });

        return res;
    }

    throw 'Could not create input model from ' + JSON.stringify(input);
}

export function getFormModel<T>(state: FormState<T>): ModelState<T> {
    return getInputModel(state);
}

function getInputStateImpl<T>(input: T, fireChange: Function, parent: any, path: string, required: boolean = false): InputState<T> {
    const errors: string[] = [];
    const run = (func: () => void) => {
        runInAction(func);
    };

    const res = {
        isInputStateImpl: true,
        value: input,
        errors: errors,
        visible: false,
        disabled: false,
        touched: false,
        required: required,
        path: path,

        setErrors(errors: string[]) {
            run(() => {
                this.errors = errors;
            })
        },
        setVisibility(visible: boolean) {
            run(() => {
                this.visible = visible;
            });
        },

        setDisabled(disabled: boolean) {
            run(() => {
                this.disabled = disabled;
            });
        },
    
        setRequired(required: boolean) {
            run(() => {
                this.required = required;
            });
        },
    
        onChange(value: T) {
            run(() => {
                this.value = value;

                fireChange(this);
            });
        },

        get dirty() {          
            return deepEquals(this.value, input) === false;
        }
    }
    return res;
}

function deepEquals(a: any, b: any): boolean {
    if(a === b){
        return true;
    }

    if(isInputState(a)){
        return deepEquals(a.value, b);
    }

    if(isInputState(b)){
        return deepEquals(a, b.value);
    }

    const isArray = Array.isArray(a);
    const keys = isArray ? [] : Object.keys(a);

    if(isPrimitive(a) && isPrimitive(b))
    {
        return a === b;
    }
    else if(isArray)
    {
        if(Array.isArray(b))
        {
            if(a.length !== b.length)
            {
                return false;
            }

            for(var i = 0; i < a.length; i++){
                var av = a[i];
                var bv = b[i];
                if(!deepEquals(av, bv))
                {
                    return false;
                }
            }

            return true;
        }

        return false;
    }
    else if (keys.length > 0)
    {
        if(Object.keys(b).length !== keys.length)
        {
            return false;
        }
        
        for(var i = 0; i < keys.length; i++)
        {
            const key = keys[i];
            const av = a[key];
            const bv = b[key];
            if(!deepEquals(av, bv))
            {
                return false;
            }
        }
    }

    return true;
}
