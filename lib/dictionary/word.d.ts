export interface Word {
    title: string;
    definition: string;
    link?: string;
    updated?: string;
}
export declare class Word {
    constructor(worddata: Word);
}
