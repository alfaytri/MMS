'use client'

import { useState, useCallback } from 'react'
import { nanoid } from 'nanoid'
import { Building2, Layers, MapPinned, ChevronRight, ChevronDown, Plus, MoreHorizontal, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { NODE_TYPE_CONFIG, NODE_TYPE_CHILDREN, rebuildServicePaths, getNodeAndDescendantIds } from '@/lib/contractUtils'
import { BuildingNodeDialog } from './BuildingNodeDialog'
import type { BuildingTree, BuildingNode, ContractService } from '@/types/contracts'

const ICONS: Record<string, LucideIcon> = { Building2, Layers, MapPinned }

// Colour a node by its type — makes the complex → floor → area hierarchy legible.
const NODE_STYLE: Record<string, { tile: string; chip: string }> = {
  complex:  { tile: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',     chip: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  building: { tile: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400', chip: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' },
  floor:    { tile: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', chip: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  area:     { tile: 'bg-purple-500/10 text-purple-600 dark:text-purple-400', chip: 'bg-purple-500/10 text-purple-700 dark:text-purple-300' },
}

interface Props {
  buildingTree: BuildingTree
  services: ContractService[]
  editable: boolean
  onTreeChange: (tree: BuildingTree) => void
  onServicesChange: (services: ContractService[]) => void
  onAddService: (nodeId: string) => void
  onEditService?: (serviceId: string) => void
  onRemoveService?: (serviceId: string) => void
  renderServiceCard: (service: ContractService) => React.ReactNode
}

export function ContractBuildingTree({
  buildingTree,
  services,
  editable,
  onTreeChange,
  onServicesChange,
  onAddService,
  onEditService: _onEditService,
  onRemoveService: _onRemoveService,
  renderServiceCard,
}: Props) {
  // Nodes are expanded by default; this tracks the ones the user collapsed.
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set())
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addParentId, setAddParentId] = useState<string | null>(null)
  const [addParentType, setAddParentType] = useState<string | null>(null)

  const toggleExpand = (nodeId: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId)
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
      if (addParentId) {
        setCollapsedNodes((prev) => {
          const next = new Set(prev)
          next.delete(addParentId) // reveal the newly-added child
          return next
        })
      }
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

  function openAddChild(node: BuildingNode) {
    setAddParentId(node.id)
    setAddParentType(node.type)
    setAddDialogOpen(true)
  }

  function renderNode(node: BuildingNode) {
    const config = NODE_TYPE_CONFIG[node.type]
    const style = NODE_STYLE[node.type] || NODE_STYLE.area
    const IconComponent = ICONS[config?.icon || 'MapPinned'] || MapPinned
    const children = getChildren(node.id)
    const nodeServices = getServicesForNode(node.id)
    const hasContent = children.length > 0 || nodeServices.length > 0
    const isExpanded = hasContent && !collapsedNodes.has(node.id)
    const isEditing = editingNodeId === node.id
    const hasAllowedChildren = (NODE_TYPE_CHILDREN[node.type] || []).length > 0

    const summary = [
      children.length > 0 ? `${children.length} sub-area${children.length > 1 ? 's' : ''}` : null,
      nodeServices.length > 0 ? `${nodeServices.length} service${nodeServices.length > 1 ? 's' : ''}` : null,
    ].filter(Boolean).join(' · ')

    return (
      <div key={node.id} className="rounded-xl border bg-card">
        {/* Node header */}
        <div className="flex items-center gap-2.5 p-2.5 sm:p-3">
          {hasContent ? (
            <button
              onClick={() => toggleExpand(node.id)}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', style.tile)}>
            <IconComponent className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {isEditing ? (
                <Input
                  className="h-7 w-48 text-sm"
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
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium capitalize', style.chip)}>
                {node.type}
              </span>
            </div>
            {summary && <div className="mt-0.5 text-xs text-muted-foreground">{summary}</div>}
          </div>

          {editable && (
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onAddService(node.id)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                <span className="hidden sm:inline">Service</span>
              </Button>
              {hasAllowedChildren && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => openAddChild(node)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Floor / area</span>
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md p-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label="Node options"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => { setEditingNodeId(node.id); setEditingName(node.name) }}
                  >
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteNode(node.id)}>
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* Services + nested children */}
        {isExpanded && (
          <div className="px-2.5 pb-2.5 sm:px-3 sm:pb-3">
            {nodeServices.length > 0 && (
              <div className="space-y-2 pl-10">
                {nodeServices.map((svc) => renderServiceCard(svc))}
              </div>
            )}
            {children.length > 0 && (
              <div className="mt-2 space-y-2 border-l-2 border-border pl-4 ml-3.5">
                {children.map((child) => renderNode(child))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {rootNodes.length === 0 && (
        <div className="rounded-xl border border-dashed py-10 text-center text-muted-foreground">
          <Building2 className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm font-medium">No building structure yet</p>
          <p className="text-xs">Add a building or complex, then break it into floors and areas.</p>
        </div>
      )}

      {rootNodes.length > 0 && (
        <div className="space-y-2.5">{rootNodes.map((node) => renderNode(node))}</div>
      )}

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
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add building / complex
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
