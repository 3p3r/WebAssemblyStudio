/* Copyright 2018 Mozilla Foundation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import * as Mousetrap from "mousetrap";
import * as React from "react";
import { addFileTo, build, closeTabs, closeView, deleteFile, focusTabGroup, initStore, loadProject, logLn, openFile, openFiles, openProjectFiles, openView, popStatus, pushStatus, run, runTask, saveProject, setViewType, splitGroup, updateFileNameAndDescription } from "../actions/AppActions";
import { notifyArcAboutFork, publishArc } from "../actions/ArcActions";
import { Directory, File, FileType, ModelRef, Project } from "../models";
import { Service } from "../service";
import appStore from "../stores/AppStore";
import { assert, layout, resetDOMSelection } from "../util";
import Group from "../utils/group";
import { RunTaskExternals } from "../utils/taskRunner";
import { ControlCenter } from "./ControlCenter";
import { EditFileDialog } from "./EditFileDialog";
import { View, ViewTabs } from "./editor";
import { defaultViewTypeForFileType } from "./editor/View";
import { NewDirectoryDialog } from "./NewDirectoryDialog";
import { NewFileDialog } from "./NewFileDialog";
import { NewProjectDialog, Template } from "./NewProjectDialog";
import { Button } from "./shared/Button";
import {
  GoBeaker,
  GoBeakerGear, GoDesktopDownload, GoGear, GoGist,
  GoOpenIssue, GoPencil, GoQuestion, GoRepoForked,
  GoRocket, GoThreeBars
} from "./shared/Icons";
import { ShareDialog } from "./ShareDialog";
import { Split, SplitInfo, SplitOrientation } from "./Split";
import { StatusBar } from "./StatusBar";
import { ToastContainer } from "./Toasts";
import { Toolbar } from "./Toolbar";
import { UploadFileDialog } from "./UploadFileDialog";
import { Workspace } from "./Workspace";






export interface AppState {
  project: ModelRef<Project>;
  file: ModelRef<File>;
  fiddle: string;

  /**
   * If not null, the the new file dialog is open and files are created in this
   * directory.
   */
  newFileDialogDirectory?: ModelRef<Directory>;

  /**
   * If not null, the the edit file dialog is open.
   */
  editFileDialogFile?: ModelRef<File>;

  /**
   * If true, the share fiddle dialog is open.
   */
  shareDialog: boolean;

  /**
   * If true, the new project dialog is open.
   */
  newProjectDialog: boolean;

  /**
   * Primary workspace split state.
   */
  workspaceSplits: SplitInfo[];

  /**
   * Secondary control center split state.
   */
  controlCenterSplits: SplitInfo[];

  /**
   * Editor split state.
   */
  editorSplits: SplitInfo[];
  /**
   * If not null, the upload file dialog is open.
   */
  uploadFileDialogDirectory: ModelRef<Directory>;
  /**
   * If true, the new directory dialog is open.
   */
  newDirectoryDialog: ModelRef<Directory>;
  showProblems: boolean;
  showSandbox: boolean;
  tabGroups: Group[];
  activeTabGroup: Group;
  hasStatus: boolean;
  isContentModified: boolean;
  windowDimensions: string;
}

export interface AppProps {
  /**
   * If true, the Update button is visible.
   */
  update: boolean;
  fiddle: string;
  embeddingParams: EmbeddingParams;
  windowContext: AppWindowContext;
}

export enum EmbeddingType {
  None,
  Default,
  Arc
}

export interface EmbeddingParams {
  type: EmbeddingType;
  templatesName: string;
}

export interface AppWindowContext {
  promptWhenClosing: boolean;
}

export class App extends React.Component<AppProps, AppState> {
  fiddle: string;
  toastContainer: ToastContainer;
  constructor(props: AppProps) {
    super(props);
    this.state = {
      fiddle: props.fiddle,
      project: null,
      file: null,
      newFileDialogDirectory: null,
      editFileDialogFile: null,
      newProjectDialog: !props.fiddle,
      shareDialog: false,
      workspaceSplits: [
        {
          min: 200,
          max: 400,
          value: 200,
        },
        {
          min: 256
        }
      ],
      controlCenterSplits: [
        { min: 100 },
        { min: 40, value: 256 }
      ],
      editorSplits: [],
      showProblems: true,
      showSandbox: props.embeddingParams.type !== EmbeddingType.Arc,
      uploadFileDialogDirectory: null,
      newDirectoryDialog: null,
      tabGroups: null,
      activeTabGroup: null,
      windowDimensions: App.getWindowDimensions(),
      hasStatus: false,
      isContentModified: false,
    };
  }
  private async initializeProject() {
    initStore();
    this.setState({
      project: appStore.getProject(),
      tabGroups: appStore.getTabGroups(),
      activeTabGroup: appStore.getActiveTabGroup(),
      hasStatus: appStore.hasStatus(),
    });
    this.bindAppStoreEvents();
    if (this.state.fiddle) {
      this.loadProjectFromFiddle(this.state.fiddle);
    }
  }
  private static getWindowDimensions(): string {
    return `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`;
  }
  private async loadProjectFromFiddle(uri: string) {
    const project = new Project();
    pushStatus("Downloading Project");
    const fiddle = await Service.loadJSON(uri);
    popStatus();
    if (fiddle.success) {
      await Service.loadFilesIntoProject(fiddle.files, project);
      loadProject(project);
      if (project.getFile("README.md")) {
        openFiles([["README.md"]]);
      }
    } else {
      if (this.toastContainer) {
        this.toastContainer.showToast(<span>Project {uri} was not found.</span>, "error");
      }
    }
  }
  bindAppStoreEvents() {
    appStore.onLoadProject.register(() => {
      this.setState({ project: appStore.getProject() });
      runTask("project:load", true, RunTaskExternals.Setup);
    });
    appStore.onDirtyFileUsed.register((file: File) => {
      this.logLn(`Changes in ${file.getPath()} were ignored, save your changes.`, "warn");
    });
    appStore.onTabsChange.register(() => {
      this.setState({
        tabGroups: appStore.getTabGroups(),
        activeTabGroup: appStore.getActiveTabGroup(),
      });
      layout();
    });
    appStore.onDidChangeStatus.register(() => {
      this.setState({
        hasStatus: appStore.hasStatus(),
      });
    });
    appStore.onDidChangeIsContentModified.register(() => {
      this.props.windowContext.promptWhenClosing = appStore.getIsContentModified();

      this.setState({
        isContentModified: appStore.getIsContentModified(),
      });
    });
  }

  // TODO: Optimize
  // shouldComponentUpdate(nextProps: any, nextState: AppState) {
  //   let state = this.state;
  //   if (state.file !== nextState.file) return true;
  //   if (state.group !== nextState.group) return true;
  //   if (!shallowCompare(state.groups, nextState.groups)) return true;
  //   return false;
  // }

  async loadReleaseNotes() {
    const response = await fetch("notes/notes.md");
    const src = await response.text();
    const notes = new File("Release Notes", FileType.Markdown);
    notes.setData(src);
    openFile(notes, defaultViewTypeForFileType(notes.type));
  }

  async loadHelp() {
    const response = await fetch("notes/help.md");
    const src = await response.text();
    const help = new File("Help", FileType.Markdown);
    help.setData(src);
    openFile(help, defaultViewTypeForFileType(help.type));
  }

  private publishArc(): Promise<void> {
    if (this.state.isContentModified) {
      return this.fork().then(publishArc);
    } else {
      return publishArc();
    }
  }

  registerShortcuts() {
    Mousetrap.bind("command+b", () => {
      build();
    });
    Mousetrap.bind("command+enter", () => {
      if (this.props.embeddingParams.type !== EmbeddingType.Arc) {
        run();
      } else {
        this.publishArc();
      }
    });
    Mousetrap.bind("command+alt+enter", () => {
      if (this.props.embeddingParams.type !== EmbeddingType.Arc) {
        build().then(run);
      } else {
        build().then(() => this.publishArc());
      }
    });
  }
  logLn(message: string, kind: "" | "info" | "warn" | "error" = "") {
    logLn(message, kind);
  }
  componentWillMount() {
    this.initializeProject();
  }
  componentDidMount() {
    layout();
    this.registerShortcuts();
    window.addEventListener("resize", () => {
      this.setState({
        windowDimensions: App.getWindowDimensions(),
      });
    }, false);
    if (this.props.embeddingParams.type === EmbeddingType.Arc) {
      window.addEventListener("message", (e) => {
        if (typeof e.data === "object" && e.data !== null && e.data.type === "arc/fork") {
          this.fork();
        }
      });
    }
  }

  share() {
    this.setState({ shareDialog: true });
  }

  async update() {
    saveProject(this.state.fiddle);
  }
  async fork() {
    pushStatus("Forking Project");
    const fiddle = await saveProject("");
    popStatus();
    const search = window.location.search;
    if (this.state.fiddle) {
      assert(search.indexOf(this.state.fiddle) >= 0);
      history.replaceState({}, fiddle, search.replace(this.state.fiddle, fiddle));
    } else {
      const prefix = search ? search + "&" : "?";
      history.pushState({}, fiddle, `${prefix}f=${fiddle}`);
    }
    this.setState({ fiddle });
    if (this.props.embeddingParams.type === EmbeddingType.Arc) {
      notifyArcAboutFork(fiddle);
    }
  }
  async gist(fileOrDirectory?: File) {
    pushStatus("Exporting Project");
    const target: File = fileOrDirectory || this.state.project.getModel();
    const gistURI = await Service.exportToGist(target, this.state.fiddle);
    popStatus();
    if (gistURI) {
      if (this.toastContainer) {
        this.toastContainer.showToast(<span>"Gist Created!" <a href={gistURI} target="_blank" className="toast-span">Open in new tab.</a></span>);
      }
      console.log(`Gist created: ${gistURI}`);
    } else {
      console.log("Failed!");
    }
  }
  async download() {
    this.logLn("Downloading Project ...");
    const downloadService = await import("../utils/download");
    const projectModel = this.state.project.getModel();
    await downloadService.downloadProject(projectModel, this.state.fiddle);
    this.logLn("Project Zip CREATED ");
  }
  /**
   * Remember workspace split.
   */
  private workspaceSplit: SplitInfo = null;

  toolbarButtonsAreDisabled() {
    return this.state.hasStatus;
  }

  makeToolbarButtons() {
    const toolbarButtons = [
      <Button
        key="ViewWorkspace"
        icon={<GoThreeBars />}
        title="View Project Workspace"
        onClick={() => {
          const workspaceSplits = this.state.workspaceSplits;
          const first = workspaceSplits[0];
          const second = workspaceSplits[1];
          if (this.workspaceSplit) {
            Object.assign(first, this.workspaceSplit);
            this.workspaceSplit = null;
            delete second.value;
          } else {
            this.workspaceSplit = Object.assign({}, first);
            first.max = first.min = 0;
          }
          this.setState({ workspaceSplits });
        }}
      />
    ];
    if (this.props.embeddingParams.type === EmbeddingType.Default) {
      toolbarButtons.push(
        <Button
          key="EditInWebAssemblyStudio"
          icon={<GoPencil />}
          label="Edit in WebAssembly Studio"
          title="Edit Project in WebAssembly Studio"
          isDisabled={!this.state.fiddle}
          href={`//webassembly.studio/?f=${this.state.fiddle}`}
          target="wasm.studio"
          rel="noopener noreferrer"
        />);
    }
    if (this.props.embeddingParams.type === EmbeddingType.None &&
        this.props.update) {
      toolbarButtons.push(
        <Button
          key="UpdateProject"
          icon={<GoPencil />}
          label="Update"
          title="Update Project"
          isDisabled={this.toolbarButtonsAreDisabled()}
          onClick={() => {
            this.update();
          }}
        />
      );
    }
    if (this.props.embeddingParams.type === EmbeddingType.None ||
        this.props.embeddingParams.type === EmbeddingType.Arc) {
      toolbarButtons.push(
        <Button
          key="ForkProject"
          icon={<GoRepoForked />}
          label="Fork"
          title="Fork Project"
          isDisabled={this.toolbarButtonsAreDisabled()}
          onClick={() => {
            this.fork();
          }}
        />
      );
    }
    if (this.props.embeddingParams.type === EmbeddingType.None) {
      toolbarButtons.push(
        <Button
          key="CreateGist"
          icon={<GoGist />}
          label="Create Gist"
          title="Create GitHub Gist from Project"
          isDisabled={this.toolbarButtonsAreDisabled()}
          onClick={() => {
            this.gist();
          }}
        />,
        <Button
          key="Download"
          icon={<GoDesktopDownload />}
          label="Download"
          title="Download Project"
          isDisabled={this.toolbarButtonsAreDisabled()}
          onClick={() => {
            this.download();
          }}
        />,
        <Button
          key="Share"
          icon={<GoRocket />}
          label="Share"
          title={this.state.fiddle ? "Share Project" : "Cannot share a project that has not been forked yet."}
          isDisabled={this.toolbarButtonsAreDisabled() || !this.state.fiddle}
          onClick={() => {
            this.share();
          }}
        />);
    }
    toolbarButtons.push(
      <Button
        key="Build"
        icon={<GoBeaker />}
        label="Build"
        title="Build Project: CtrlCmd + B"
        isDisabled={this.toolbarButtonsAreDisabled()}
        onClick={() => {
          build();
        }}
      />);
    if (this.props.embeddingParams.type !== EmbeddingType.Arc) {
      toolbarButtons.push(
        <Button
          key="Run"
          icon={<GoGear />}
          label="Run"
          title="Run Project: CtrlCmd + Enter"
          isDisabled={this.toolbarButtonsAreDisabled()}
          onClick={() => {
            run();
          }}
        />,
        <Button
          key="BuildAndRun"
          icon={<GoBeakerGear />}
          label="Build &amp; Run"
          title="Build &amp; Run Project: CtrlCmd + Alt + Enter"
          isDisabled={this.toolbarButtonsAreDisabled()}
          onClick={() => {
            build().then(run);
          }}
        />
      );
    }
    if (this.props.embeddingParams.type === EmbeddingType.Arc) {
      toolbarButtons.push(
        <Button
          key="Preview"
          icon={<GoGear />}
          label="Preview"
          title="Preview Project: CtrlCmd + Enter"
          isDisabled={this.toolbarButtonsAreDisabled()}
          onClick={() => {
            this.publishArc();
          }}
        />
      );
      toolbarButtons.push(
        <Button
          key="BuildAndPreview"
          icon={<GoGear />}
          label="Build &amp; Preview"
          title="Build &amp; Preview Project: CtrlCmd + Alt + Enter"
          isDisabled={this.toolbarButtonsAreDisabled()}
          onClick={() => {
            build().then(() => this.publishArc());
          }}
        />
      );
    }
    if (this.props.embeddingParams.type === EmbeddingType.None) {
      toolbarButtons.push(
        <Button
          key="GithubIssues"
          icon={<GoOpenIssue />}
          label="GitHub Issues"
          title="GitHub Issues"
          customClassName="issue"
          href="https://github.com/wasdk/WebAssemblyStudio"
          target="_blank"
          rel="noopener noreferrer"
        />,
        <Button
          key="HelpAndPrivacy"
          icon={<GoQuestion />}
          label="Help & Privacy"
          title="Help & Privacy"
          customClassName="help"
          onClick={() => {
            this.loadHelp();
          }}
        />
      );
    }
    return toolbarButtons;
  }
  render() {
    const self = this;

    const makeEditorPanes = () => {
      const groups = this.state.tabGroups;
      const activeGroup = this.state.activeTabGroup;

      if (groups.length === 0) {
        return <div>No Groups</div>;
      }
      return groups.map((group: Group, i: number) => {
        // tslint:disable-next-line:jsx-key
        return <ViewTabs
          key={`editorPane${i}`}
          views={group.views.slice(0)}
          view={group.currentView}
          preview={group.preview}
          onSplitViews={() => splitGroup()}
          hasFocus={activeGroup === group}
          onFocus={() => {
            // TODO: Should be taken care of in shouldComponentUpdate instead.
            focusTabGroup(group);
          }}
          onChangeViewType={(view, type) => setViewType(view, type)}
          onClickView={(view: View) => {
            if (!(appStore.getActiveTabGroup().currentView === view)) {
              // Avoids the propagation of content selection between tabs.
              resetDOMSelection();
            }
            focusTabGroup(group);
            openView(view);
          }}
          onDoubleClickView={(view: View) => {
            focusTabGroup(group);
            openView(view, false);
          }}
          onClose={(view: View) => {
            focusTabGroup(group);
            closeView(view);
          }}
        />;
      });
    };

    const editorPanes = <Split
      name="Editors"
      orientation={SplitOrientation.Vertical}
      defaultSplit={{
        min: 128,
      }}
      splits={this.state.editorSplits}
      onChange={(splits) => {
        this.setState({ editorSplits: splits });
        layout();
      }}
    >
      {makeEditorPanes()}
    </Split>;

    return <div className="fill">
      <ToastContainer ref={(ref) => this.toastContainer = ref}/>
      {this.state.newProjectDialog &&
        <NewProjectDialog
          isOpen={true}
          templatesName={this.props.embeddingParams.templatesName}
          onCancel={() => {
            this.setState({ newProjectDialog: null });
          }}
          onCreate={async (template: Template) => {
            await openProjectFiles(template);
            this.setState({ newProjectDialog: false });
          }}
        />
      }
      {this.state.newFileDialogDirectory &&
        <NewFileDialog
          isOpen={true}
          directory={this.state.newFileDialogDirectory}
          onCancel={() => {
            this.setState({ newFileDialogDirectory: null });
          }}
          onCreate={(file: File) => {
            addFileTo(file, this.state.newFileDialogDirectory.getModel());
            this.setState({ newFileDialogDirectory: null });
          }}
        />
      }
      {this.state.editFileDialogFile &&
        <EditFileDialog
          isOpen={true}
          file={this.state.editFileDialogFile}
          onCancel={() => {
            this.setState({ editFileDialogFile: null });
          }}
          onChange={(name: string, description) => {
            const file = this.state.editFileDialogFile.getModel();
            updateFileNameAndDescription(file, name, description);
            this.setState({ editFileDialogFile: null });
          }}
        />
      }
      {this.state.shareDialog &&
        <ShareDialog
          isOpen={true}
          fiddle={this.state.fiddle}
          onCancel={() => {
            this.setState({ shareDialog: false });
          }}
        />
      }
      {this.state.uploadFileDialogDirectory &&
        <UploadFileDialog
          isOpen={true}
          directory={this.state.uploadFileDialogDirectory}
          onCancel={() => {
            this.setState({ uploadFileDialogDirectory: null });
          }}
          onUpload={(files: File[]) => {
            files.map((file: File) => {
              addFileTo(file, this.state.uploadFileDialogDirectory.getModel());
            });
            this.setState({ uploadFileDialogDirectory: null });
          }}
        />
      }
      {this.state.newDirectoryDialog &&
        <NewDirectoryDialog
          isOpen={true}
          directory={this.state.newDirectoryDialog}
          onCancel={() => {
            this.setState({ newDirectoryDialog: null });
           }}
          onCreate={(directory: Directory) => {
            addFileTo(directory, this.state.newDirectoryDialog.getModel());
            this.setState({ newDirectoryDialog: null });
          }}
        />
      }
      <div style={{ height: "calc(100% - 22px)" }}>
        <Split
          name="Workspace"
          orientation={SplitOrientation.Vertical}
          splits={this.state.workspaceSplits}
          onChange={(splits) => {
            this.setState({ workspaceSplits: splits });
            layout();
          }}
        >
          <Workspace
            project={this.state.project}
            file={this.state.file}
            onNewFile={(directory: Directory) => {
              this.setState({ newFileDialogDirectory: ModelRef.getRef(directory)});
            }}
            onEditFile={(file: File) => {
              this.setState({ editFileDialogFile: ModelRef.getRef(file)});
            }}
            onDeleteFile={(file: File) => {
              let message = "";
              if (file instanceof Directory) {
                message = `Are you sure you want to delete '${file.name}' and its contents?`;
              } else {
                message = `Are you sure you want to delete '${file.name}'?`;
              }
              if (confirm(message)) {
                closeTabs(file);
                deleteFile(file);
              }
            }}
            onClickFile={(file: File) => {
              // Avoids the propagation of content selection between tabs.
              resetDOMSelection();
              openFile(file, defaultViewTypeForFileType(file.type));
            }}
            onDoubleClickFile={(file: File) => {
              if (file instanceof Directory) {
                return;
              }
              openFile(file, defaultViewTypeForFileType(file.type), false);
            }}
            onMoveFile={(file: File, directory: Directory) => {
              addFileTo(file, directory);
            }}
            onUploadFile={(directory: Directory) => {
              this.setState({ uploadFileDialogDirectory: ModelRef.getRef(directory)});
            }}
            onNewDirectory={(directory: Directory) => {
              this.setState({ newDirectoryDialog: ModelRef.getRef(directory)});
            }}
            onCreateGist={(fileOrDirectory: File) => {
                this.gist(fileOrDirectory);
            }}
          />
          <div className="fill">
            <div style={{ height: "40px" }}>
              <Toolbar>{this.makeToolbarButtons()}</Toolbar>
            </div>
            <div style={{ height: "calc(100% - 40px)" }}>
              <Split
                name="Console"
                orientation={SplitOrientation.Horizontal}
                splits={this.state.controlCenterSplits}
                onChange={(splits) => {
                  this.setState({ controlCenterSplits: splits });
                  layout();
                }}
              >
                {editorPanes}
                <ControlCenter
                  showSandbox={this.state.showSandbox}
                  onToggle={() => {
                    const splits = this.state.controlCenterSplits;
                    splits[1].value = splits[1].value === 40 ? 256 : 40;
                    this.setState({ controlCenterSplits: splits });
                    layout();
                  }}
                />
              </Split>
            </div>
          </div>
        </Split>
      </div>
      <StatusBar />
      <div id="task-runner-content" />
    </div>;
  }
}
