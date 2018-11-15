import {Component, EventEmitter, Input, Output, ViewChild} from '@angular/core';

import 'rxjs/add/operator/debounceTime';
import 'rxjs/add/operator/distinctUntilChanged';
import {NgForm} from "@angular/forms";
import {MessageHandlerService} from "../../../../src/app/shared/message-handler/message-handler.service";
import {Cluster} from "../../../../src/app/shared/model/v1/cluster";
import {CacheService} from "../../../../src/app/shared/auth/cache.service";
import {ResourcesActionType} from "../../../../src/app/shared/shared.const";
import {PublishStatus} from "../../../../src/app/shared/model/v1/publish-status";
import {PublishStatusService} from "../../../../src/app/shared/client/v1/publishstatus.service";
import {ServiceTpl} from "../../../shared/model/servicetpl";
import {ServiceService} from "../../../shared/client/v1/service.service";
import {ServiceClient} from "../../../shared/client/v1/kubernetes/service";
import {Service} from "../../../shared/model/service";
import {KubeService} from "../../../shared/model/kubernetes/service";

@Component({
  selector: 'publish-tpl',
  templateUrl: 'publish-tpl.component.html',
  styleUrls: ['publish-tpl.scss']
})
export class PublishServiceTplComponent {
  @Output() published = new EventEmitter<boolean>();
  @Input() appId: number;
  modalOpened: boolean = false;
  publishForm: NgForm;
  @ViewChild('publishForm')
  currentForm: NgForm;
  clusters = Array<Cluster>();
  serviceTpl: ServiceTpl;
  isSubmitOnGoing: boolean = false;
  title: string;
  forceOffline: boolean;
  actionType: ResourcesActionType;

  constructor(private messageHandlerService: MessageHandlerService,
              public cacheService: CacheService,
              private serviceService: ServiceService,
              private serviceClient: ServiceClient,
              private publishStatusService: PublishStatusService) {
  }

  newPublishTpl(service: Service, serviceTpl: ServiceTpl, actionType: ResourcesActionType) {
    this.serviceTpl = serviceTpl;
    this.clusters = Array<Cluster>();
    this.actionType = actionType;
    this.forceOffline = false;
    if (actionType == ResourcesActionType.PUBLISH) {
      this.title = "发布负载均衡[" + service.name + "]";
      if (!service.metaData) {
        this.messageHandlerService.warning("请先配置可发布集群");
        return
      }
      this.modalOpened = true;
      let metaData = JSON.parse(service.metaData);
      for (let cluster of metaData.clusters) {
        if (this.cacheService.namespace.metaDataObj && this.cacheService.namespace.metaDataObj.clusterMeta[cluster]) {
          let c = new Cluster();
          c.name = cluster;
          this.clusters.push(c)
        }
      }

    } else if (actionType == ResourcesActionType.OFFLINE) {
      this.title = "下线负载均衡[" + service.name + "]";
      this.modalOpened = true;
      for (let state of serviceTpl.status) {
        let c = new Cluster();
        c.name = state.cluster;
        this.clusters.push(c)
      }
    }

  }

  onCancel() {
    this.currentForm.reset();
    this.modalOpened = false;
  }

  onSubmit() {
    if (this.isSubmitOnGoing) {
      return;
    }
    this.isSubmitOnGoing = true;

    this.clusters.map(cluster => {
      if (cluster.checked) {
        switch (this.actionType) {
          case ResourcesActionType.PUBLISH:
            this.deploy(cluster);
            break;
          case ResourcesActionType.OFFLINE:
            this.offline(cluster);
            break;
        }
      }
    });

    this.isSubmitOnGoing = false;
    this.modalOpened = false;
  }

  getStatusByCluster(status: PublishStatus[], cluster: string): PublishStatus {
    if (status && status.length > 0) {
      for (let state of status) {
        if (state.cluster == cluster) {
          return state
        }
      }
    }
    return null
  }

  offline(cluster: Cluster) {
    let state = this.getStatusByCluster(this.serviceTpl.status, cluster.name);
    this.serviceClient.deleteByName(this.appId, cluster.name, this.cacheService.kubeNamespace, this.serviceTpl.name).subscribe(
      response => {
        this.deletePublishStatus(state.id);
      },
      error => {
        if (this.forceOffline){
          this.deletePublishStatus(state.id);
        }else {
          this.messageHandlerService.handleError(error);
        }
      }
    );
  }

  deletePublishStatus(id: number) {
    this.publishStatusService.deleteById(id).subscribe(
      response => {
        this.messageHandlerService.showSuccess("下线成功！");
        this.published.emit(true);
      },
      error => {
        this.messageHandlerService.handleError(error);
      }
    );
  }

  deploy(cluster: Cluster) {
    let kubeService: KubeService = JSON.parse(this.serviceTpl.template);
    kubeService.metadata.namespace = this.cacheService.kubeNamespace;
    this.serviceClient.deploy(
      this.appId,
      cluster.name,
      this.serviceTpl.serviceId,
      this.serviceTpl.id,
      kubeService).subscribe(
      response => {
        this.messageHandlerService.showSuccess("发布成功！");
        this.published.emit(true);
      },
      error => {
        this.messageHandlerService.handleError(error);
      }
    );
  }

  public get isValid(): boolean {
    return this.currentForm &&
      this.currentForm.valid &&
      !this.isSubmitOnGoing;
  }

}
