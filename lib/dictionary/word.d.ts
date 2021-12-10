export interface OxfordEntry {
    updated: string[];
    title: string[];
    link: any[];
}
export interface Word {
    title: string;
    definition: string;
    link?: string;
    updated?: string;
}
export declare class Word {
    constructor(worddata: Word);
    /**
     * If the specified entry is updated theday, a Word is returned.
     * @param feedentry
     * @param theday
     */
    static isWordOfTheDay(feedentry: OxfordEntry, theday?: Date): Word | null;
}
