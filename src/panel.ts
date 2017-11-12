import {JsonObject} from "./jsonobject";
import {HashTable} from "./helpers";
import {Base, ISurveyImpl, IPage, IPanel, IConditionRunner, ISurvey, ISurveyData, IElement, IQuestion, SurveyElement} from "./base";
import {QuestionBase} from "./questionbase";
import {ConditionRunner} from "./conditions";
import {QuestionFactory} from "./questionfactory";
import {ILocalizableOwner, LocalizableString} from "./localizablestring";
import {surveyCss} from "./defaultCss/cssstandard";

export class QuestionRowModel {
    private visibleValue: boolean;
    visibilityChangedCallback: () => void;
    constructor(public panel: PanelModelBase) {
        this.visibleValue = panel.survey && panel.survey.isDesignMode;
    }
    public elements: Array<IElement> = [];
    //TODO remove after updating react and vue
    public get questions(): Array<IElement> { return this.elements;}
    public get visible(): boolean { return this.visibleValue; }
    public set visible(val: boolean) {
        if (val == this.visible) return;
        this.visibleValue = val;
        this.onVisibleChanged();
    }
    public updateVisible() {
        this.visible = this.calcVisible();
        this.setWidth();
    }
    public addElement(q: IElement) {
        this.elements.push(q);
        this.updateVisible();
    }
    protected onVisibleChanged() {
        if (this.visibilityChangedCallback) this.visibilityChangedCallback();
    }
    private setWidth() {
        var visCount = this.getVisibleCount();
        if (visCount == 0) return;
        var counter = 0;
        for (var i = 0; i < this.elements.length; i++) {
            if (this.elements[i].isVisible) {
                var q = this.elements[i];
                q.renderWidth = q.width ? q.width : Math.floor(100 / visCount) + '%';
                q.rightIndent = counter < visCount - 1 ? 1 : 0;
                counter++;
            } else {
                this.elements[i].renderWidth = "";
            }
        }
    }
    private getVisibleCount(): number {
        var res = 0;
        for (var i = 0; i < this.elements.length; i++) {
            if (this.elements[i].isVisible) res++;
        }
        return res;
    }
    private calcVisible(): boolean { return this.getVisibleCount() > 0; }
}

/**
 * A base class for a Panel and Page objects.
 */
export class PanelModelBase extends SurveyElement implements IPanel, IConditionRunner, ILocalizableOwner {
    private static panelCounter = 100;
    private static getPanelId(): string {
        return "sp_" + PanelModelBase.panelCounter++;
    }

    private rowValues: Array<QuestionRowModel> = null;
    private conditionRunner: ConditionRunner = null;
    private elementsValue: Array<IElement>;
    private isQuestionsReady: boolean = false;
    private questionsValue: Array<QuestionBase> = new Array<QuestionBase>();
    rowsChangedCallback: () => void;

    constructor(public name: string = "") {
        super(name);
        this.elementsValue = this.createNewArray("elements", function(item) {self.onAddElement(item, self.elementsValue.length);}, function(item) { self.onRemoveElement(item);} );
        this.registerFunctionOnPropertyValueChanged("elements", function() {self.markQuestionListDirty(); self.onRowsChanged();});
        this.id = PanelModelBase.getPanelId();
        var self = this;
        var locTitleValue = this.createLocalizableString("title", this, true);
        locTitleValue.onRenderedHtmlCallback = function(text) { return self.getRenderedTitle(text); };
    }
    public setSurveyImpl(value: ISurveyImpl) {
        super.setSurveyImpl(value);
        if(this.survey && this.survey.isDesignMode) this.onVisibleChanged();
        for(var i = 0; i < this.elements.length; i ++) {
            this.elements[i].setSurveyImpl(value);
        }
    }
    endLoadingFromJson() {
        super.endLoadingFromJson();
        this.markQuestionListDirty(); 
        this.onRowsChanged();
    }
    /**
     * PanelModel or PageModel title property.
     */
    public get title(): string { return this.getLocalizableStringText("title"); }
    public set title(val: string) { this.setLocalizableStringText("title", val); }
    get locTitle(): LocalizableString { return this.getLocalizableString("title"); }
    getLocale(): string { return this.survey ? (<ILocalizableOwner><any>this.survey).getLocale() : ""; }
    getMarkdownHtml(text: string)  { return this.survey ? (<ILocalizableOwner><any>this.survey).getMarkdownHtml(text) : null; }
    /**
     * A parent element. It is always null for the Page object and always not null for the Panel object. Panel object may contain Questions and other Panels.
     */
    public get parent(): PanelModelBase { return this.getPropertyValue("parent", null); }
    public set parent(val: PanelModelBase) { this.setPropertyValue("parent", val); }
    /**
     * An expression that returns true or false. If it returns true the Panel becomes visible and if it returns false the Panel becomes invisible. The library runs the expression on survey start and on changing a question value. If the property is empty then visible property is used.
     * @see visible
     */
    public get visibleIf(): string { return this.getPropertyValue("visibleIf", ""); }
    public set visibleIf(val: string) { this.setPropertyValue("visibleIf", val); }
    public get cssClasses(): any {
        return this.css;
    }
    private get css(): any { return surveyCss.getCss(); }
    /**
     * A unique element identificator. It is generated automatically.
     */
    public get id(): string { return this.getPropertyValue("id"); }
    public set id(val: string) { this.setPropertyValue("id", val); }
    /**
     * Returns true if the current object is Panel. Returns false if the current object is Page (a root Panel).
     */
    public get isPanel(): boolean { return false; }
    /**
     * Returns the list of all questions located in the Panel/Page, including in the nested Panels.
     * @see QuestionBase
     * @see elements
     */
    public get questions(): Array<QuestionBase> {
        if(!this.isQuestionsReady) {
            this.questionsValue = [];
            for(var i = 0; i < this.elements.length; i ++) {
                var el = this.elements[i];
                if(el.isPanel) {
                    var qs = (<PanelModel>el).questions;
                    for(var j = 0; j < qs.length; j ++) {
                        this.questionsValue.push(qs[j]);
                    }
                } else {
                    this.questionsValue.push(<QuestionBase>el);
                }
            }
            this.isQuestionsReady = true;
        }

        return this.questionsValue;
    }
    public getQuestionByName(name: string) : QuestionBase {
        var questions = this.questions;
        for(var i = 0; i < questions.length; i ++) {
            if(questions[i].name == name) return questions[i];
        }
        return null;
    }
    private markQuestionListDirty() {
        this.isQuestionsReady = false;
        if(this.parent) this.parent.markQuestionListDirty();
    }
    /**
     * Returns the list of the elements in the object, Panel/Page. Elements can be questions or panels. The function doesn't return elements in the nested Panels.
     */
    public get elements(): Array<IElement> { return this.elementsValue; }
    public getElementsInDesign(includeHidden: boolean = false): Array<IElement> { return this.elements; }
    /**
     * Returns true if the current element belongs to the Panel/Page. It looks in nestede Panels as well.
     * @param element
     * @see PanelModel
     */
    public containsElement(element: IElement): boolean {
        for(var i = 0; i < this.elements.length; i ++) {
            var el: any = this.elements[i];
            if(el == element) return true;
            if(el.isPanel) {
                if((<PanelModelBase>el).containsElement(element)) return true;
            }
        }
        return false;
    }
    /**
     * Returns true, if there is an error on this Page or inside the current Panel
     * @param fireCallback set it to true, to show errors in UI
     * @param focuseOnFirstError set it to true to focuse on the first question that doesn't pass the validation
     */
    public hasErrors(fireCallback: boolean = true, focuseOnFirstError: boolean = false): boolean {
        var result = false;
        var firstErrorQuestion = null;
        var visibleQuestions = [];
        this.addQuestionsToList(visibleQuestions, true);
        for (var i = 0; i < visibleQuestions.length; i++) {
            var question = visibleQuestions[i];
            if(question.isReadOnly) continue;
            if (question.hasErrors(fireCallback)) {
                if (focuseOnFirstError && firstErrorQuestion == null) {
                    firstErrorQuestion = question;
                }
                result = true;
            }
        }
        if (firstErrorQuestion) firstErrorQuestion.focus(true);
        return result;
    }
    /**
     * Fill list array with the questions.
     * @param list 
     * @param visibleOnly set it to true to get visible questions only
     */
    public addQuestionsToList(list: Array<IQuestion>, visibleOnly: boolean = false, includingDesignTime: boolean = false) {
        this.addElementsToList(list, visibleOnly, includingDesignTime, false);
    }
    /**
     * Fill list array with the panels.
     * @param list 
     */
    public addPanelsIntoList(list: Array<IPanel>, visibleOnly: boolean = false, includingDesignTime: boolean = false) {
        this.addElementsToList(<Array<IElement>>list, visibleOnly, includingDesignTime, true);
    }
    private addElementsToList(list: Array<IElement>, visibleOnly: boolean, includingDesignTime: boolean, isPanel: boolean) {
        if (visibleOnly && !this.visible) return;
        this.addElementsToListCore(list, this.elements, visibleOnly, includingDesignTime, isPanel);
    }   
    private addElementsToListCore(list: Array<IElement>, elements: Array<IElement>, visibleOnly: boolean, includingDesignTime: boolean, isPanel: boolean) {
        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            if (visibleOnly && !el.visible) continue;
            if(isPanel && el.isPanel || !isPanel && !el.isPanel) {
                list.push(el);
            }
            if(el.isPanel) {
                (<PanelModel>el).addElementsToListCore(list, (<PanelModel>el).elements, visibleOnly, includingDesignTime, isPanel);
            }
            else {
                if(includingDesignTime) {
                    this.addElementsToListCore(list, (<SurveyElement><any>el).getElementsInDesign(false), visibleOnly, includingDesignTime, isPanel);
                }
            }
        }
    }    
    get rows(): Array<QuestionRowModel> {
        if(!this.rowValues) {
            this.rowValues = this.buildRows();
        }
        return this.rowValues;
    }
    /**
     * Returns true if the current object is Page and it is the current page.
     */
    public get isActive() { return (!this.survey) || this.survey.currentPage == this.root; }
    public updateCustomWidgets() { 
        for(var i = 0; i < this.elements.length; i ++) {
            this.elements[i].updateCustomWidgets();
        }
    }

    protected get root(): PanelModelBase {
        var res = <PanelModelBase>this;
        while(res.parent) res = res.parent;
        return res;
    }
    protected createRow(): QuestionRowModel { return new QuestionRowModel(this); }
    onSurveyLoad() {
        for(var i = 0; i < this.elements.length; i ++) {
            this.elements[i].onSurveyLoad();
        }
        if(this.rowsChangedCallback) this.rowsChangedCallback();
    }
    protected onRowsChanged() {
        this.rowValues = null;
        if(this.rowsChangedCallback && !this.isLoadingFromJson) this.rowsChangedCallback();
    }
    private get isDesignMode() { return this.survey && this.survey.isDesignMode; }
    private onAddElement(element: IElement, index: number) {
        element.setSurveyImpl(this.surveyImpl);
        element.parent = this;
        if(element.isPanel) {
            var p = <PanelModel>element;
            if(this.survey) {
                this.survey.panelAdded(p, index, this, this.root);
            }
        } else {
            if(this.survey) {
                var q = <QuestionBase>element;
                this.survey.questionAdded(q, index, this, this.root);
            }
        }
        var self = this;
        (<Base><any>element).registerFunctionOnPropertiesValueChanged(["visible", "isVisible"], function () { self.onElementVisibilityChanged(element); }, this.id);
        (<Base><any>element).registerFunctionOnPropertyValueChanged("startWithNewLine", function () { self.onElementStartWithNewLineChanged(element); }, this.id);
    }
    private onRemoveElement(element: IElement) {
        element.parent = null;
        (<Base><any>element).unRegisterFunctionOnPropertiesValueChanged(["visible", "isVisible", "startWithNewLine"], this.id);
        if(!element.isPanel) {
            if(this.survey) this.survey.questionRemoved(<QuestionBase>element);
        } else {
            if(this.survey) this.survey.panelRemoved(element);
        }
    }
    private onElementVisibilityChanged(element: any) {
        if (this.rowValues) {
            this.updateRowsVisibility(element);
        }
        if(this.parent) {
            this.parent.onElementVisibilityChanged(this);
        }
    }
    private onElementStartWithNewLineChanged(element: any) {
        this.onRowsChanged();
    }
    private updateRowsVisibility(element: any)  {
        for (var i = 0; i < this.rowValues.length; i++) {
            var row = this.rowValues[i];
            if (row.elements.indexOf(element) > -1) {
                row.updateVisible();
                break;
            }
        }
    }
    private buildRows(): Array<QuestionRowModel> {
        var result = new Array<QuestionRowModel>();
        var lastRowVisibleIndex = -1;
        var self = this;
        for (var i = 0; i < this.elements.length; i++) {
            var el = this.elements[i];
            var isNewRow = i == 0 || el.startWithNewLine;
            var row = isNewRow ? this.createRow() : result[result.length - 1];
            if(isNewRow) result.push(row);
            row.addElement(el);
        }
        for (var i = 0; i < result.length; i++) {
            result[i].updateVisible();
        }
        return result;
    }
    /**
     * Returns rendered title text or html.
     */
    public get processedTitle() {
        return this.getRenderedTitle(this.locTitle.textOrHtml);
    }
    protected getRenderedTitle(str: string): string {
        if(!str && this.isPanel && this.isDesignMode) return "[" + this.name + "]";
        return this.textProcessor != null ? this.textProcessor.processText(str, true) : str;
    }
    /**
     * Use it to get/set the object visibility.
     * @see visibleIf
     */
    public get visible(): boolean { return this.getPropertyValue("visible", true); }
    public set visible(value: boolean) {
        if (value === this.visible) return;
        this.setPropertyValue("visible", value);
        this.setPropertyValue("isVisible", this.isVisible);
        if(!this.isLoadingFromJson) this.onVisibleChanged();
    }
    protected onVisibleChanged() {
        this.setPropertyValue("isVisible", this.isVisible);
    }
    /**
     * Returns true if object is visible or survey is in design mode right now.
     */
    public get isVisible(): boolean {  return (this.survey && this.survey.isDesignMode) || this.getIsPageVisible(null); }
    getIsPageVisible(exceptionQuestion: IQuestion): boolean {
        if (!this.visible) return false;
        for (var i = 0; i < this.questions.length; i++) {
            if (this.questions[i] == exceptionQuestion) continue;
            if (this.questions[i].visible) return true;
        }
        return false;
    }
    /**
     * Add an elememnt into Panel or Page.
     * @param element 
     * @param index element index in the elements array
     */
    public addElement(element: IElement, index: number = -1) {
        if (element == null) return;
        if (index < 0 || index >= this.elements.length) {
            this.elements.push(element);
        } else {
            this.elements.splice(index, 0, element);
        }
    }
    /**
     * Add a question into Panel or Page.
     * @param question 
     * @param index element index in the elements array
     */
    public addQuestion(question: QuestionBase, index: number = -1) {
        this.addElement(question, index);
    }
    /**
     * Add a panel into Panel or Page.
     * @param panel 
     * @param index element index in the elements array
     */
    public addPanel(panel: PanelModel, index: number = -1) {
        this.addElement(panel, index);
    }
    /**
     * Creates a new question and adds it into the end of the elements list.
     * @param questionType the possible values are: "text", "checkbox", "dropdown", "matrix", "html", "matrixdynamic", "matrixdropdown" and so on.
     * @param name a question name
     */
    public addNewQuestion(questionType: string, name: string = null): QuestionBase {
        var question = QuestionFactory.Instance.createQuestion(questionType, name);
        this.addQuestion(question);
        return question;
    }
    /**
     * Creates a new panel and adds it into the end of the elements list.
     * @param name a panel name
     */
    public addNewPanel(name: string = null): PanelModel {
        var panel = this.createNewPanel(name);
        this.addPanel(panel);
        return panel;
    }
    protected createNewPanel(name: string): PanelModel {
        return new PanelModel(name);
    }
    /**
     * Remove an element (Panel or Question) from the elements list.
     * @param element 
     * @see elements
     */
    public removeElement(element: IElement): boolean {
        var index = this.elements.indexOf(element);
        if (index < 0) {
            for(var i = 0; i < this.elements.length; i ++) {
                if(this.elements[i].removeElement(element)) return true;
            }
            return false;
        }
        this.elements.splice(index, 1);
        return true;
    }
    /**
     * Remove question  from the elements list.
     * @param question 
     * @see elements
     * @see removeElement
     */
    public removeQuestion(question: QuestionBase) {
        this.removeElement(question);
    }
    runCondition(values: HashTable<any>) {
        for(var i = 0; i < this.elements.length; i ++) {
            this.elements[i].runCondition(values);
        }
        if (!this.visibleIf) return;
        if (!this.conditionRunner) this.conditionRunner = new ConditionRunner(this.visibleIf);
        this.conditionRunner.expression = this.visibleIf;
        this.visible = this.conditionRunner.run(values);
    }
    onLocaleChanged() {
        for(var i = 0; i < this.elements.length; i ++) {
            this.elements[i].onLocaleChanged()
        }
        this.locTitle.onChanged();
    }
    onAnyValueChanged(name: string) {
        for(var i = 0; i < this.elements.length; i ++) {
            this.elements[i].onAnyValueChanged(name);
        }
        var titleValue = this.locTitle.text;
        if(!titleValue) return; 
        if(titleValue.toLocaleLowerCase().indexOf('{' + name.toLowerCase()) > -1) {
            this.locTitle.onChanged();
        }
    }
}

/**
 * A container element, similar to the Page objects. However, unlike the Page, Panel can't be a root. 
 * It may contain questions and other panels.
 */
export class PanelModel extends PanelModelBase implements IElement {
    constructor(public name: string = "") {
        super(name);
    }
    public getType(): string { return "panel"; }
    public get isPanel(): boolean { return true; }
    /**
     * The Panel width.
     */
    public get width(): string { return this.getPropertyValue("width"); }
    public set width(val: string) { this.setPropertyValue("width", val); }
    /**
     * The inner indent. Set this property to increase the panel content margin. 
     */
    public get innerIndent(): number { return this.getPropertyValue("innerIndent", 0); }
    public set innerIndent(val: number) { this.setPropertyValue("innerIndent", val); }
    get renderWidth(): string { return this.getPropertyValue("renderWidth"); }
    set renderWidth(val: string) { this.setPropertyValue("renderWidth", val); }
    /**
     * The Panel renders on the new line if the property is true. If the property is false, the panel tries to render on the same line/row with a previous question/panel.
     */
    public get startWithNewLine(): boolean { return this.getPropertyValue("startWithNewLine", true); }
    public set startWithNewLine(value: boolean) { this.setPropertyValue("startWithNewLine", value); }
    /**
     * The right indent of the Panel.
     */
    public get rightIndent(): number { return this.getPropertyValue("rightIndent", 0); }
    public set rightIndent(val: number) { this.setPropertyValue("rightIndent", val); }
    protected onVisibleChanged() {
        super.onVisibleChanged();
        this.setPropertyValue("isVisible", this.isVisible);
        if (this.survey != null) {
            this.survey.panelVisibilityChanged(this, this.visible);
        }
     }
}

JsonObject.metaData.addClass("panel", ["name",  { name: "elements", alternativeName: "questions", baseClassName: "question", visible: false },
    { name: "startWithNewLine:boolean", default: true}, { name: "visible:boolean", default: true }, "visibleIf:condition", 
    { name: "title:text", serializationProperty: "locTitle" }, {name: "innerIndent:number", default: 0, choices: [0, 1, 2, 3]}], function () { return new PanelModel(); });