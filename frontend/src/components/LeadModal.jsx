import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../shared/context/ThemeProvider';
import { useAppState } from '../shared/context/AppStateProvider';
import { FaUser, FaEye, FaEdit, FaUsers, FaEllipsisH, FaTimes, FaPhone, FaEnvelope, FaBuilding, FaMapMarkerAlt, FaCalendarAlt, FaComments } from 'react-icons/fa';
import EditLeadModal from './EditLeadModal';
import LeadDetailsModal from './LeadDetailsModal';
import AddActionModal from './AddActionModal';
import ReAssignLeadModal from '../shared/components/ReAssignLeadModal';
import { getLeadPermissionFlags } from '../services/leadPermissions';
import { getPhoneLines } from '../shared/utils/phoneDisplay';

const LeadModal = ({ isOpen, onClose, lead, assignees = [], onAssign, canAddAction = true }) => {
  const { t, i18n } = useTranslation();
  const { resolvedTheme } = useTheme();
  const { user } = useAppState();
  const isLight = resolvedTheme === 'light';
  const leadPermissionFlags = getLeadPermissionFlags(user);
  const canOpenAddAction = canAddAction && leadPermissionFlags.canAddAction;
  const canOpenEditLead = leadPermissionFlags.canEditInfo || leadPermissionFlags.canEditPhone;
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showAddActionModal, setShowAddActionModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  if (!isOpen || !lead) return null;

  const bgColor = isLight ? 'bg-white' : 'bg-gray-900';
  const textColor = isLight ? 'text-gray-800' : 'text-gray-100';
  const borderColor = isLight ? 'border-gray-200' : 'border-gray-700';
  const secondaryTextColor = isLight ? 'text-gray-600' : 'text-gray-400';
  const isArabic = String(i18n.language || '').startsWith('ar');

  const normalizedAssignees = Array.isArray(assignees)
    ? assignees
        .map((assignee) => {
          if (!assignee) return null;
          if (typeof assignee === 'string') {
            return { id: null, name: assignee, role: '' };
          }

          return {
            ...assignee,
            id: assignee.id ?? assignee.userId ?? null,
            name: assignee.name ?? assignee.userName ?? assignee.full_name ?? '',
            role: assignee.role ?? assignee.job_title ?? '',
          };
        })
        .filter((assignee) => assignee?.name)
    : [];

  const handleAddAction = (newAction) => {
    console.log('Add new action:', newAction);
  };

  const handleEditLead = (updatedLead) => {
    console.log('Update lead:', updatedLead);
  };

  const handleViewDetails = () => {
    console.log('View lead details:', lead);
    setShowDetailsModal(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close modal"
      />

      <div
        className={`relative w-full sm:w-[90%] sm:max-w-2xl max-h-[85vh] h-auto overflow-y-auto rounded-none sm:rounded-2xl border shadow-xl ${bgColor} ${borderColor} ${textColor}`}
      >
        <div className={`flex items-center justify-between px-6 py-4 border-b ${borderColor}`}>
          <div className="flex items-center gap-3">
            <FaUser className="text-blue-600" size={20} />
            <h2 className="text-xl font-semibold text-transparent bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text">
              {t('Lead Details')}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleViewDetails}
              className="btn btn-sm btn-circle bg-blue-600 hover:bg-blue-700 text-white border-none"
              title="View"
            >
              <FaEye size={16} />
            </button>
            {canOpenAddAction && (
              <button
                onClick={() => setShowAddActionModal(true)}
                className="btn btn-sm bg-green-600 hover:bg-green-700 text-white border-none"
                title="Add Action"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
            )}
            {canOpenEditLead && (
              <button
                onClick={() => setShowEditModal(true)}
                className={`btn btn-sm btn-circle btn-ghost transition-colors ${secondaryTextColor} hover:text-blue-600`}
                title="Edit"
              >
                <FaEdit size={16} />
              </button>
            )}
            <button
              onClick={() => setShowAssignModal(true)}
              className="btn btn-sm btn-circle bg-blue-600 hover:bg-blue-700 text-white border-none"
              title="Assign"
            >
              <FaUsers size={16} />
            </button>
            <button
              onClick={() => console.log('More options for lead:', lead)}
              className={`btn btn-sm btn-circle btn-ghost transition-colors ${secondaryTextColor} hover:text-blue-600`}
              title="More Options"
            >
              <FaEllipsisH size={16} />
            </button>
            <button
              onClick={onClose}
              className="btn btn-sm btn-circle btn-ghost text-red-500"
            >
              <FaTimes size={20} />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <FaUser className={secondaryTextColor} size={16} />
                <div className="flex-1">
                  <label className={`text-sm font-medium ${secondaryTextColor}`}>{t('Full Name')}</label>
                  <p className="text-lg font-semibold">{lead.leadName || lead.name || 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <FaPhone className={secondaryTextColor} size={16} />
                <div className="flex-1">
                  <label className={`text-sm font-medium ${secondaryTextColor}`}>{t('Mobile')}</label>
                  {(() => {
                    const raw = lead.mobile || lead.phone || '';
                    const lines = getPhoneLines(raw, {
                      showFull: true,
                      defaultCountryCode:
                        lead.phone_country ||
                        lead.phoneCountry ||
                        lead?.meta_data?.phone_country ||
                        lead?.metaData?.phone_country ||
                        lead?.meta_data?.phoneCountry ||
                        lead?.metaData?.phoneCountry ||
                        '+20',
                    });
                    if (!lines.length) return <p className="text-lg">{'N/A'}</p>;
                    return (
                      <div className="text-lg space-y-1">
                        {lines.map((l, idx) => (
                          <div key={idx} dir="ltr">{l.display}</div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <FaEnvelope className={secondaryTextColor} size={16} />
                <div className="flex-1">
                  <label className={`text-sm font-medium ${secondaryTextColor}`}>{t('Email')}</label>
                  <p className="text-lg">{lead.email || 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <FaBuilding className={secondaryTextColor} size={16} />
                <div className="flex-1">
                  <label className={`text-sm font-medium ${secondaryTextColor}`}>{t('Company')}</label>
                  <p className="text-lg">{lead.company || lead.project || 'N/A'}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <FaMapMarkerAlt className={secondaryTextColor} size={16} />
                <div className="flex-1">
                  <label className={`text-sm font-medium ${secondaryTextColor}`}>{t('Location')}</label>
                  <p className="text-lg">{lead.country || lead.city || 'N/A'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <FaCalendarAlt className={secondaryTextColor} size={16} />
                <div className="flex-1">
                  <label className={`text-sm font-medium ${secondaryTextColor}`}>{t('Created At')}</label>
                  <p className="text-lg">{lead.createdAt || lead.created_at || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className={`rounded-xl border p-4 ${borderColor}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <FaComments className="text-blue-600" />
                {t('Recent Activities')}
              </h3>
              <div className="flex gap-2">
                {canOpenAddAction && (
                  <button
                    onClick={() => setShowAddActionModal(true)}
                    className="btn btn-sm bg-green-600 hover:bg-green-700 text-white border-none flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    {t('Add Action')}
                  </button>
                )}
                <button
                  onClick={handleViewDetails}
                  className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-none flex items-center gap-1"
                >
                  <FaEye size={12} />
                  {t('View All')}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                  <FaPhone className="text-blue-600 dark:text-blue-400" size={14} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{t('Phone Call')}</span>
                    <span className={`text-xs ${secondaryTextColor}`}>2024-01-20</span>
                  </div>
                  <p className={`text-sm mt-1 ${secondaryTextColor}`}>
                    {t('Follow-up call completed. Client interested in proposal.')}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="w-8 h-8 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                  <FaEnvelope className="text-green-600 dark:text-green-400" size={14} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{t('Email Sent')}</span>
                    <span className={`text-xs ${secondaryTextColor}`}>2024-01-18</span>
                  </div>
                  <p className={`text-sm mt-1 ${secondaryTextColor}`}>
                    {t('Proposal document sent to client for review.')}
                  </p>
                </div>
              </div>

              <div className="text-center py-2">
                <button
                  onClick={handleViewDetails}
                  className={`text-sm ${secondaryTextColor} hover:text-blue-600 transition-colors`}
                >
                  {t('View all activities')} -&gt;
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={`flex justify-end gap-3 px-6 py-4 border-t ${borderColor}`}>
          <button
            onClick={onClose}
            className="btn btn-sm bg-red-600 hover:bg-red-700 text-white border-none"
          >
            {t('Close')}
          </button>
          {canOpenEditLead && (
            <button
              className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-none"
              onClick={() => setShowEditModal(true)}
            >
              {t('Edit Lead')}
            </button>
          )}
        </div>
      </div>

      <EditLeadModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={handleEditLead}
        lead={lead}
        canEditInfo={leadPermissionFlags.canEditInfo}
        canEditPhone={leadPermissionFlags.canEditPhone}
      />

      <LeadDetailsModal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        lead={lead}
      />

      <AddActionModal
        isOpen={showAddActionModal && canOpenAddAction}
        onClose={() => setShowAddActionModal(false)}
        onSave={handleAddAction}
        lead={lead}
      />

      <ReAssignLeadModal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        lead={lead}
        onAssign={onAssign}
        isArabic={isArabic}
        currentUser={user}
        usersOverride={normalizedAssignees}
        selectedCount={1}
      />
    </div>
  );
};

export default LeadModal;
