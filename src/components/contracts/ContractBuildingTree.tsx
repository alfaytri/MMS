'use client'

import { useState, useCallback } from 'react'
import { nanoid } from 'nanoid'
import { Building2, Layers, MapPinned, ChevronRight, ChevronDown, Plus, Trash2, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { NODE_TYPE_CONFIG, NODE_TYPE_CHILDREN, validateTreeIntegrity, rebuildServicePaths, getNodeAndDescendantIds } from '@/lib/contractUtils'
import { BuildingNodeDialog } from './BuildingNodeDialog'
import type { BuildingTree, BuildingNode, ContractService } from '@/types/contracts'

const ICONS: Record<string, any> = { Building2, Layers, MapPinned }

interface Props {
  buildingTree: BuildingTree
  services: ContractService[]
  editable: boolean
  onTreeChange: (tree: BuildingTree) => void
  onServicesChange: (services: ContractService[]) => void
  onAddService: (nodeId: string) => void
  onEditService: (serviceId: string) => void
  onRemoveService: (serviceId: string) => void
  renderServiceCard: (service: ContractService) => React.ReactNode
}

export function ContractBuildingTree({
  buildingTree,
  services,
  editable,
  onTreeChange,
  onServicesChange,
  onAddService,
  onEditService,
  onRemoveService,
  renderServiceCard,
}: Props) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addParentId, setAddParentId] = useState<string | null>(null)
  const [addParentType, setAddParentType] = useState<string | null>(null)

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId)
      return next
    })
  }

  const rootNodes = buildingTree.nodes.filter((n) => !n.parentId)
  const getChildren = (parentId: string) =>
    buildingTree.nodes.filter((n) => n.parentId === parentId)
  const getServicesForNode = (nodeId: string) =>
    services.filter((s) => s.building_node_id === nodeId)

  const handleAddNode = useCallback(
    (name: string, type: string) => {
      const newNode: BuildingNode = {
        id: `n_${nanoid(8)}`,
        name,
        type: type as BuildingNode['type'],
        parentId: addParentId,
      }
      const newTree = { nodes: [...buildingTree.nodes, newNode] }
      onTreeChange(newTree)
      setExpandedNodes((prev) => {
        const next = new Set(prev)
        if (addParentId) next.add(addParentId)
        return next
      })
    },
    [addParentId, buildingTree, onTreeChange],
  )

  const handleRenameNode = useCallback(
    (nodeId: string, newName: string) => {
      const newTree = {
        nodes: buildingTree.nodes.map((n) =>
          n.id === nodeId ? { ...n, name: newName } : n,
        ),
      }
      const updatedServices = rebuildServicePaths(newTree, services)
      onTreeChange(newTree)
      onServicesChange(updatedServices)
      setEditingNodeId(null)
    },
    [buildingTree, services, onTreeChange, onServicesChange],
  )

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      const descendantIds = getNodeAndDescendantIds(buildingTree, nodeId)
      const hasServices = services.some(
        (s) => s.building_node_id && descendantIds.has(s.building_node_id),
      )
      if (hasServices) {
        alert('Remove or reassign services before deleting this node.')
        return
      }
      const hasChildren = buildingTree.nodes.some((n) => n.parentId === nodeId)
      if (hasChildren) {
        alert('Remove child nodes first.')
        return
      }
      const newTree = { nodes: buildingTree.nodes.filter((n) => n.id !== nodeId) }
      onTreeChange(newTree)
    },
    [buildingTree, services, onTreeChange],
  )

  function renderNode(node: BuildingNode, depth: number) {
    const config = NODE_TYPE_CONFIG[node.type]
    const IconComponent = ICONS[config?.icon || 'MapPinned'] || MapPinned
    const children = getChildren(node.id)
    const nodeServices = getServicesForNode(node.id)
    const isExpanded = expandedNodes.has(node.id)
    const isEditing = editingNodeId === node.id
    const hasAllowedChildren = (NODE_TYPE_CHILDREN[node.type] || []).length > 0

    return (
      <div key={node.id} style={{ marginLeft: `${depth * 24}px` }} className="mb-2">
        <div
          className={cn(
            'rounded-md border-l-4 bg-card p-3',
            config?.borderColor || 'border-gray-300',
          )}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleExpand(node.id)}
              className="text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
            <IconComponent className="h-4 w-4 text-muted-foreground" />
            {isEditing ? (
              <Input
                className="h-7 text-sm w-48"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => handleRenameNode(node.id, editingName)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameNode(node.id, editingName)
                  if (e.key === 'Escape') setEditingNodeId(null)
                }}
                autoFocus
              />
            ) : (
              <span className="text-sm font-medium">{node.name}</span>
            )}
            <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
              {node.type}
            </span>
            {nodeServices.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {nodeServices.length} service{nodeServices.length > 1 ? 's' : ''}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
              {editable && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onAddService(node.id)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Service
                </Button>
              )}
              {editable && (
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md h-7 w-7 p-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {hasAllowedChildren && (
                      <DropdownMenuItem
                        onClick={() => {
                          setAddParentId(node.id)
                          setAddParentType(node.type)
                          setAddDialogOpen(true)
                        }}
                      >
                        Add Floor / Area
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingNodeId(node.id)
                        setEditingName(node.name)
                      }}
                    >
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleDeleteNode(node.id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {isExpanded && nodeServices.length > 0 && (
            <div className="mt-3 space-y-2 ml-6">
              {nodeServices.map((svc) => renderServiceCard(svc))}
            </div>
          )}
        </div>

        {isExpanded && children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  return (
    <div>
      {rootNodes.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No building structure defined</p>
          <p className="text-xs">Click &quot;Edit Structure&quot; to add buildings, floors, and areas.</p>
        </div>
      )}

      {rootNodes.map((node) => renderNode(node, 0))}

      {editable && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => {
            setAddParentId(null)
            setAddParentType(null)
            setAddDialogOpen(true)
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Building / Complex
        </Button>
      )}

      <BuildingNodeDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        parentType={addParentType}
        onAdd={handleAddNode}
      />
    </div>
  )
}
