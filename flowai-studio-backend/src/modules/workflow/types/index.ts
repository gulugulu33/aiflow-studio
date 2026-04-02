export interface INodeExecutor {
  execute(node: any, context: Record<string, any>): Promise<Record<string, any>>;
}
