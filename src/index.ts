import { observable, runInAction, extendObservable } from 'mobx';

import { IValidationRegistry, isValid, ValidationResult } from 'validator-inator';
import * as t from 'io-ts';
import * as tdc from 'io-ts-derive-class';

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
    type: t.Type<any>;
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
    validate(): void;
    onChange(newValue: TValue): void;
};

function isArray(input: any): input is Array<any> {
    return input && input.slice && Array.isArray(input.slice())
}

function isInputState(input: any): input is InputState<any> {
    return input && input.isInputStateImpl === true;
}

export interface FormStateArray<T> {
    length: number;
    getItem(index: number): FormState<T>;
    add(item: T): void;
    push(item: T): void;
    remove(index: number): FormState<T>;
    map<U>(callbackfn: (value: FormState<T>, index: number, array: FormState<T>[]) => U): U[];
    forEach(callbackfn: (value: FormState<T>, index: number, array: FormState<T>[]) => void): void;
    filter(callbackfn: (value: FormState<T>, index: number, array: FormState<T>[]) => any): FormState<T>[];
    splice(start: number, deleteCount?: number): FormState<T>[];
    splice(start: number, deleteCount: number, ...inputItems: FormState<T>[]): FormState<T>[];
}

function getFormStateArray<T, Ctx>(
    originalItems: Array<FormState<T>>, 
    registry: IValidationRegistry<Ctx>, 
    ctx: Ctx,
    triggerValidation: Function, 
    type: t.Type<any>, 
    pathCtx: PathContext
): FormStateArray<T> {

    return {
        isFormStateArray: true,
        items: originalItems,
        get length(): number { return this.items.length; },
        getItem(index: number) {
            return this.items[index];
        },
        add(item: T) {
            runInAction(() => {
                let inputState = getInputState(item, registry, ctx, triggerValidation, type, observable({ parent: () => pathCtx, index: this.length}));
                this.items.push(inputState);
            });
        },
        push(item: T) {
            this.add(item);
        },
        remove(index: number): FormState<T> {
            var res: any = [];
            runInAction(() => {
                res = this.items.splice(index, 1);
                let items: FormState<T>[] = this.items;
                for(var i = 0; i < items.length; i++){
                    var item: any = items[i];
                    item.pathCtx.index = i;
                }
            });

            return res[0]
        },
        map<U>(callbackfn: (value: FormState<T>, index: number, array: FormState<T>[]) => U): U[] {
            return this.items.map(callbackfn);
        },
        forEach(callbackfn: (value: FormState<T>, index: number, array: FormState<T>[]) => void): void {
            this.items.forEach(callbackfn);
        },
        filter(callbackfn: (value: FormState<T>, index: number, array: FormState<T>[]) => any): FormState<T>[] {
            return this.items.filter(callbackfn);
        },
        splice(start: number, deleteCount: number, inputItems?: FormState<T>[]): FormState<T>[] {
            var res: any = []
            runInAction(() => {
                res = inputItems !== undefined ? this.items.splice(start, deleteCount, inputItems) : this.items.splice(start, deleteCount)
                let items: FormState<T>[] = this.items;
                for(var i = 0; i < items.length; i++){
                    var item: any = items[i];
                    item.pathCtx.index = i;
                }
            })
            
            return res;
        }
    } as any;
}

function isFormStateArray(input: any): input is FormStateArray<any> {
    return input && input.isFormStateArray === true;
}

export type SetState<T> = {
    setValue(input: T): void;
}

export type FormStateType<T> = {
    [P in keyof T]: T[P] extends Function ? never :
                    T[P] extends primitive ? InputState<T[P]> :
                    T[P] extends Array<infer U> ? InputState<FormStateArray<U>> :
                    InputState<FormStateType<T[P]>> & SetState<T[P]>;
}

export type ModelState<T> = {
    [P in keyof T]: T[P] extends Function ? never :
                    T[P] extends primitive ? T[P] :
                    T[P] extends Array<infer U> ? U extends primitive ? U[] : ModelState<U>[] :
                    ModelState<T[P]>
}

export type FormValidationResult<T> = {
    result: ValidationResult<T>
    isValid: boolean   
}

export interface IFormModel<T> {
    readonly model: T;
    validate(): Promise<FormValidationResult<T>>;
}

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>

export type FormState<T> = Omit<InputState<FormStateType<T>>, "validate"> & IFormModel<T>;

export type Constructor<T = {}> = new (...args: any[]) => T;

function getType(input: any): t.InterfaceType<any> | null {
    if(input && input.getType) {
        let t = input.getType();
        if(t){
            const tag = (t as any)['_tag'];
            if(tag === "InterfaceType"){
                return t as t.InterfaceType<any>;
            }
        }
    }

    return null;
}

type PathContext = {
    parent?: () => PathContext;
    index?: number;
    name?: string;
};

function getInputState<Ctx>(input: any, registry: IValidationRegistry<Ctx>, ctx: Ctx, triggerValidation: Function, type: t.Type<any>, pathCtx: PathContext, required: boolean = false): any
{
    if(isPrimitive(input))
    {
        return getInputStateImpl(input, registry, ctx, triggerValidation, type, pathCtx, required) as any;
    }

    if(isArray(input))
    {
        const arrayType: t.ArrayType<any> = type as t.ArrayType<any>;
        const res: any = input.map((entry: any, i: number) => 
                            getInputState(entry, registry, ctx, triggerValidation, arrayType.type, observable({ parent: () => pathCtx, index: i}))
                         );
        const formStateArray: any = getFormStateArray(res, registry, ctx, triggerValidation, arrayType.type, pathCtx);
        return getInputStateImpl(formStateArray, registry, ctx, triggerValidation, type, pathCtx) as any;
    }

    const keys = Object.keys(input);
    if(keys.length > 0){
        let inputType = getType(input) || type;
        const requiredFields: any = registry.getRequiredFieldsFor(input.constructor);
        const isRequiredField = (field: string) => requiredFields[field] === true;

        const record:any = {};
        keys.forEach(k => {
            const value: any = input[k];
            const required = isRequiredField(k);
            const propType = (inputType as any).props[k];
            record[k] = getInputState(value, registry, ctx, triggerValidation, propType, observable({ parent: () => pathCtx, name: k}), required);
        });

        return getInputStateImpl(record, registry, ctx, triggerValidation, type, pathCtx) as any;
    }

    throw new Error('Could not create inputstate from ' + JSON.stringify(input));
}

function applyErrorsToFormState(result: any, input: InputState<any>) {
    if(input === undefined){
        return;
    }

    if(isArray(result)){
        const errors = (result as any).errors
        const isErrorsArray = isArray(errors)
        
        if(isErrorsArray){
            input.setErrors(errors);
            result.forEach((r, i) => {
                applyErrorsToFormState(r, input.value.getItem(i));
            });
        }
        else {
            input.setErrors(result);
        }

        return;
    }

    if(typeof result !== "object"){
        return;
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

export function deriveFormState<T extends tdc.ITyped<any>, Ctx>(input: T, registry: IValidationRegistry<Ctx>, ctx: Ctx): FormState<T> {

    const runValidation = function(current: InputState<any>, form: FormState<T>): void {
        registry.validate(form.model as any, ctx, input, current.path).then(result => {
            applyErrorsToFormState(result, form);
        });
    };

    var getFormState: () => FormState<T> | undefined = () => undefined;
    const triggerValidation = (current: InputState<any>) => {
        let form = getFormState();
        if(form !== undefined)
        {
            runValidation(current, form);
        }
    };

    const pathCtx = observable({} as PathContext);
    const state = getInputState(input, registry, ctx, triggerValidation, input.getType(), pathCtx);
    state.validate = () => { 
        return new Promise<FormValidationResult<T>>(resolver => {
            let form = getFormState();
            if(form === undefined){
                throw new Error('Cannot validate undefined form!');
            }

            registry.validate(form.model, ctx, input).then(result => {
                const valid = isValid(result);
                if(!valid){
                    applyErrorsToFormState(result, form as any);
                }
                resolver({
                    result: result,
                    isValid: valid
                });
            });
        });
    };

    const obs = observable(state);
    extendObservable(obs, {
        get model(): T { return new (input as any).constructor(getFormModel<T>(this as any) as any); }
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

    if(isFormStateArray(input)){
        
        return input.map((i: any) => getInputModel(i));
    }

    if(isArray(input)){
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

    throw new Error('Could not create input model from ' + JSON.stringify(input));
}

export function getFormModel<T>(state: FormState<T>): ModelState<T> {
    return getInputModel(state);
}


function getPathFromContext(ctx: PathContext): string {
    let path = ctx.parent !== undefined ? getPathFromContext(ctx.parent()) : '';
    path = ctx.index !== undefined ? path + '[' + ctx.index + ']' : path;
    path = ctx.name !== undefined ? path + '.' + ctx.name : path;

    return path;
}

function haveErrorsChanged(originalErrors: string[], newErrors: string[]) {
    if(originalErrors.length === 0 && newErrors.length === 0)
    {
        return false
    }

    if(originalErrors.length !== newErrors.length){
        return true;
    }

    return originalErrors.some((value, index) => value !== newErrors[index])
}

function getInputStateImpl<T, Ctx>(input: T, registry: IValidationRegistry<Ctx>, ctx: Ctx, triggerValidation: Function, type: t.Type<any>, pathCtx: PathContext, required: boolean = false): InputState<T> {
    const errors: string[] = [];
    const run = (func: () => void) => {
        runInAction(func);
    };

    const res = {
        isInputStateImpl: true,
        type: type,
        value: input,
        errors: errors,
        visible: true,
        disabled: false,
        touched: false,
        required: required,

        pathCtx: pathCtx,
        get path(): string {
            return getPathFromContext(this.pathCtx);
        },

        setErrors(errors: string[]) {
            if(haveErrorsChanged(this.errors, errors)){
                run(() => {
                    this.errors = errors;
                })
            }
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

        validate() {
            run(() => {
                triggerValidation(this);
            });
        },
    
        onChange(value: T) {
            run(() => {
                this.value = value;

                this.validate();
            });
        },

        get dirty() {          
            return deepEquals(this.value, input) === false;
        },

        setValue(value: T) {
            run(() => {
                let newState = getInputState(value, registry, ctx, triggerValidation, type, pathCtx);
                this.value = newState.value;
            })
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

    if(isFormStateArray(a)) {
        return deepEquals((a as any).items, b);
    }

    if(isFormStateArray(b)) {
        return deepEquals(a, (b as any).items);
    }

    if(isPrimitive(a) && isPrimitive(b))
    {
        return a === b;
    }

    if(a === undefined && b !== undefined)
    {
        return false;
    }

    if(b === undefined && a !== undefined)
    {
        return false;
    }

    if(a === null && b !== null)
    {
        return false;
    }

    if(b === null && a !== null)
    {
        return false;
    }

    const isAnArray = isArray(a);
    const keys = isAnArray ? [] : Object.keys(a);
    
    if(isAnArray)
    {
        if(isArray(b))
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
